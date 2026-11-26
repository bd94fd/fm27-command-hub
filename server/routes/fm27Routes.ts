import express from 'express';
import {
  AnalystOverloadError,
  AnalystTimeoutError,
  DEEP_MODEL_ID,
  formatFriendlyGeminiError,
  GeminiService,
  isQuotaRateLimitError,
  isRetiredGeminiModel,
  isTransientOverloadError,
  type ReasoningMode,
} from '../geminiService.ts';
import {
  buildAnalyzeScreenshotSystemPrompt,
  buildJourneyReportSystemPrompt,
  buildMatchDebriefSystemPrompt,
  buildTacticalChatSystemPrompt,
  normalizePersona,
} from '../prompts.ts';
import {
  ANALYZE_SCREENSHOT_SCHEMA,
  JOURNEY_REPORT_SCHEMA,
  MATCH_DEBRIEF_SCHEMA,
  TACTICAL_CHAT_SCHEMA,
} from '../schemas.ts';
import { createSecurityGuard } from '../middleware/securityGuard.ts';
import {
  buildClientErrorEvent,
  buildServerErrorEvent,
  logServerError,
} from '../errorReporting.ts';
import {
  extractStructuredJsonObject,
  normalizeTacticalChatHistory,
} from '../jsonExtractor.ts';
import { mergeAnalystCitations } from '../../src/utils/analystCitations.ts';

export interface Fm27RoutesOptions {
  geminiService?: GeminiService;
  securityGuard?: express.RequestHandler;
}

export function createFm27Router(options: Fm27RoutesOptions = {}): express.Router {
  const router = express.Router();
  const gemini = options.geminiService ?? new GeminiService();
  const config = gemini.getConfig();
  const guard =
    options.securityGuard ??
    createSecurityGuard({
      hubAccessToken: config.hubAccessToken,
      maxImageBytes: config.maxImageBytes,
      maxContextChars: config.maxContextChars,
      rateLimitWindowMs: config.rateLimitWindowMs,
      rateLimitMaxRequests: config.rateLimitMaxRequests,
    });

  const logFailure = (
    req: express.Request,
    res: express.Response,
    error: unknown,
    status: number
  ): void => {
    if (status < 500) return;
    logServerError(
      buildServerErrorEvent({
        requestId: res.locals.requestId as string | undefined,
        method: req.method,
        path: req.originalUrl,
        status,
        error,
        context: { scope: 'fm27Routes' },
      })
    );
  };

  const respondFailure = (
    req: express.Request,
    res: express.Response,
    error: unknown
  ): express.Response => {
    if (error instanceof AnalystTimeoutError) {
      logFailure(req, res, error, 504);
      return res.status(504).json({ error: error.message });
    }
    if (error instanceof AnalystOverloadError || isTransientOverloadError(error)) {
      const status =
        error instanceof AnalystOverloadError
          ? error.status
          : isQuotaRateLimitError(error)
            ? 429
            : 503;
      logFailure(req, res, error, status);
      return res.status(status).json({ error: formatFriendlyGeminiError(error) });
    }
    logFailure(req, res, error, 500);
    return res.status(500).json({ error: formatFriendlyGeminiError(error) });
  };

  router.get('/health', (_req, res) => {
    const activeModel =
      config.geminiModelOverride && !isRetiredGeminiModel(config.geminiModelOverride)
        ? config.geminiModelOverride
        : DEEP_MODEL_ID;
    res.json({
      status: 'ok',
      app: 'fm27-command-hub',
      hasGeminiKey: gemini.hasApiKey(),
      model: activeModel,
      fastModel: gemini.getFastModelId(),
      fallbackModel: config.fallbackModel,
      analystTimeoutMs: config.aiTimeoutMs,
      deepAnalystTimeoutMs: config.deepAiTimeoutMs,
      lastAiFailure: gemini.getLastUpstreamFailure(),
    });
  });

  router.post('/fm27/client-error', guard, (req, res) => {
    const report = (req.body as { report?: unknown } | undefined)?.report;
    if (!report || typeof report !== 'object' || Array.isArray(report)) {
      return res.status(400).json({ error: 'A structured error report is required.' });
    }
    let serialized = '';
    try {
      serialized = JSON.stringify(report);
    } catch {
      return res.status(400).json({ error: 'The error report could not be read.' });
    }
    if (serialized.length > 64_000) {
      return res.status(413).json({ error: 'The error report is too large.' });
    }
    const event = buildClientErrorEvent(report, {
      requestId: res.locals.requestId as string | undefined,
      method: req.method,
      path: req.path,
    });
    logServerError(event);
    return res.status(202).json({ ok: true, requestId: event.requestId });
  });

  router.post('/fm27/analyze-screenshot', guard, async (req, res) => {
    try {
      const { imageBase64, mimeType, notes, nextEventNumber, clubName } =
        req.body as {
          imageBase64?: string;
          mimeType?: string;
          notes?: string;
          nextEventNumber?: number;
          clubName?: string;
        };

      if (!gemini.hasApiKey()) {
        logFailure(req, res, 'GEMINI_API_KEY is missing.', 500);
        return res.status(500).json({
          error:
            'GEMINI_API_KEY is missing. Set GEMINI_API_KEY in your .env file or cloud environment variables.',
        });
      }

      const eventNum = nextEventNumber || 1;
      const targetClub = clubName || 'the managed club';
      const systemPrompt = buildAnalyzeScreenshotSystemPrompt(targetClub, eventNum);

      const parts: Array<
        | { text: string }
        | { inlineData: { mimeType: string; data: string } }
      > = [];

      if (imageBase64 && mimeType) {
        parts.push({
          inlineData: {
            mimeType,
            data: imageBase64,
          },
        });
      }

      parts.push({
        text: `Analyze this FM27 screen / match update for ${targetClub} (Event #${eventNum}). User notes: "${notes || 'Extract match statistics, xG, ratings, and a plain-English tactical audit.'}"`,
      });

      const response = await gemini.generateContent(
        {
          contents: { parts },
          config: {
            systemInstruction: systemPrompt,
            responseMimeType: 'application/json',
            responseSchema: ANALYZE_SCREENSHOT_SCHEMA,
          },
        },
        {
          reasoningMode: 'deep_high',
        }
      );

      const extracted = extractStructuredJsonObject(response.text ?? '');
      if (!extracted.ok) {
        logFailure(req, res, 'The Tactical Analyst returned malformed JSON.', 502);
        return res.status(502).json({
          error: 'The Tactical Analyst returned malformed JSON. Please retry.',
        });
      }
      const payload = extracted.value as Record<string, unknown>;
      payload.sourceCitations = mergeAnalystCitations(
        payload.sourceCitations,
        typeof payload.analysisMarkdown === 'string'
          ? payload.analysisMarkdown
          : null
      );
      return res.json(payload);
    } catch (error: unknown) {
      return respondFailure(req, res, error);
    }
  });

  router.post('/fm27/tactical-chat', guard, async (req, res) => {
    try {
      const {
        message,
        history,
        images,
        importedFileContext,
        liveAppContext,
        reasoningMode,
        persona,
        nextEventNumber,
        currentSaveDate,
        clubName,
      } = req.body as {
        message?: string;
        history?: Array<{ role: 'user' | 'assistant'; text: string }>;
        images?: Array<{ base64: string; mimeType: string; name?: string }>;
        importedFileContext?: string;
        liveAppContext?: string;
        reasoningMode?: ReasoningMode;
        persona?: string;
        nextEventNumber?: number;
        currentSaveDate?: string;
        clubName?: string;
      };

      if (!gemini.hasApiKey()) {
        logFailure(req, res, 'GEMINI_API_KEY is missing.', 500);
        return res.status(500).json({
          error:
            'GEMINI_API_KEY is missing. Set GEMINI_API_KEY in your .env file or cloud environment variables.',
        });
      }

      const eventNum = nextEventNumber || 1;
      const targetClub =
        clubName && clubName !== '--' ? clubName : 'the manager’s club';

      const systemPrompt = buildTacticalChatSystemPrompt({
        targetClub,
        persona: normalizePersona(persona),
        liveAppContext,
      });

      const contents: Array<{
        role: 'user' | 'model';
        parts: Array<
          | { text: string }
          | { inlineData: { mimeType: string; data: string } }
        >;
      }> = [];

      const normalizedHistory = normalizeTacticalChatHistory(history, 6);
      for (const item of normalizedHistory) {
        contents.push(item);
      }

      const currentTurnParts: Array<
        | { text: string }
        | { inlineData: { mimeType: string; data: string } }
      > = [];

      if (importedFileContext && importedFileContext.trim().length > 0) {
        currentTurnParts.push({
          text: `NEWLY ATTACHED / IMPORTED FM27 SAVE OR EXPORT PAYLOAD ON THIS TURN:\n${importedFileContext}`,
        });
      }

      if (Array.isArray(images)) {
        for (const img of images) {
          if (img.base64 && img.mimeType) {
            currentTurnParts.push({
              inlineData: {
                mimeType: img.mimeType,
                data: img.base64,
              },
            });
          }
        }
      }

      currentTurnParts.push({
        text: `Manager's Current Message / Tactical Question / Submission (Current In-Game Date: ${currentSaveDate || '--'} | Next Chronicle Event #${eventNum}):\n${
          message ||
          'Analyze the attached FM27 save / file(s) / screenshot(s) against Bobby Dean Playbook v2.0, update everything possible, and produce a complete tactical & squad plan from the current in-game date.'
        }`,
      });

      contents.push({
        role: 'user',
        parts: currentTurnParts,
      });

      const response = await gemini.generateContent(
        {
          contents,
          config: {
            systemInstruction: systemPrompt,
            responseMimeType: 'application/json',
            responseSchema: TACTICAL_CHAT_SCHEMA,
          },
        },
        {
          reasoningMode: reasoningMode ?? 'deep_high',
        }
      );

      const extracted = extractStructuredJsonObject(response.text ?? '');
      if (!extracted.ok) {
        logFailure(req, res, 'The Tactical Analyst returned malformed JSON.', 502);
        return res.status(502).json({
          error: 'The Tactical Analyst returned malformed JSON. Please retry.',
        });
      }
      const payload = extracted.value as Record<string, unknown>;
      payload.sourceCitations = mergeAnalystCitations(
        payload.sourceCitations,
        typeof payload.analysisMarkdown === 'string'
          ? payload.analysisMarkdown
          : null
      );
      return res.json(payload);
    } catch (error: unknown) {
      return respondFailure(req, res, error);
    }
  });

  router.post('/fm27/match-debrief', guard, async (req, res) => {
    try {
      const { clubName, matchSummary, activeShape, activeTacticSummary } = req.body as {
        clubName?: string;
        matchSummary?: Record<string, unknown>;
        activeShape?: string;
        activeTacticSummary?: string;
      };

      if (!gemini.hasApiKey()) {
        logFailure(req, res, 'GEMINI_API_KEY is missing.', 500);
        return res.status(500).json({
          error:
            'GEMINI_API_KEY is missing. Set GEMINI_API_KEY in your environment variables.',
        });
      }

      const targetClub =
        clubName && clubName !== '--' ? clubName : 'the managed club';
      const systemPrompt = buildMatchDebriefSystemPrompt(targetClub);
      const compactPayload = JSON.stringify(
        {
          clubName: targetClub,
          activeShape: activeShape || '4-3-3 DM Wide',
          activeTacticRoles: activeTacticSummary || undefined,
          match: matchSummary || {},
        },
        null,
        2
      );

      const response = await gemini.generateContent(
        {
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: `Generate a structured FM27 Patch 27.1.0 Post-Match Tactical Debrief for this match. Strictly reference ONLY the club's actual formation and IP/OOP roles provided in activeTacticRoles (never invent roles the club does not use):\n${compactPayload}`,
                },
              ],
            },
          ],
          config: {
            systemInstruction: systemPrompt,
            responseMimeType: 'application/json',
            responseSchema: MATCH_DEBRIEF_SCHEMA,
          },
        },
        {
          reasoningMode: 'fast_lite',
        }
      );

      const extracted = extractStructuredJsonObject(response.text ?? '');
      if (!extracted.ok) {
        logFailure(req, res, 'The Tactical Analyst returned malformed debrief JSON.', 502);
        return res.status(502).json({
          error: 'The Tactical Analyst returned malformed debrief JSON.',
        });
      }
      const payload = extracted.value as Record<string, unknown>;
      payload.sourceCitations = mergeAnalystCitations(
        payload.sourceCitations,
        typeof payload.analysisMarkdown === 'string'
          ? payload.analysisMarkdown
          : null
      );
      return res.json(payload);
    } catch (error: unknown) {
      return respondFailure(req, res, error);
    }
  });

  router.post('/fm27/journey-report', guard, async (req, res) => {
    try {
      const body = req.body as {
        clubName?: string;
        journeySummary?: Record<string, unknown>;
        journeyData?: Record<string, unknown>;
      };
      const journeySummary = body.journeySummary ?? body.journeyData;
      const clubName =
        body.clubName ??
        (typeof journeySummary?.clubName === 'string'
          ? journeySummary.clubName
          : undefined);

      if (!gemini.hasApiKey()) {
        logFailure(req, res, 'GEMINI_API_KEY is missing.', 500);
        return res.status(500).json({
          error:
            'GEMINI_API_KEY is missing. Set GEMINI_API_KEY in your environment variables.',
        });
      }

      if (!journeySummary || typeof journeySummary !== 'object') {
        return res.status(400).json({
          error: 'journeySummary object is required to generate an AI Journey Briefing.',
        });
      }

      const targetClub =
        clubName && clubName !== '--' ? clubName : 'the managed club';
      const systemPrompt = buildJourneyReportSystemPrompt(targetClub);
      const compactPayload = JSON.stringify(journeySummary).slice(0, 14000);

      const response = await gemini.generateContent(
        {
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: `Generate a structured FM27 Patch 27.1.0 Executive Save-to-Save Journey Briefing from this verified career diff payload:\n${compactPayload}`,
                },
              ],
            },
          ],
          config: {
            systemInstruction: systemPrompt,
            responseMimeType: 'application/json',
            responseSchema: JOURNEY_REPORT_SCHEMA,
          },
        },
        {
          reasoningMode: 'deep_high',
        }
      );

      const extracted = extractStructuredJsonObject(response.text ?? '');
      if (!extracted.ok) {
        logFailure(
          req,
          res,
          'The Tactical Analyst returned malformed Journey Briefing JSON.',
          502
        );
        return res.status(502).json({
          error: 'The Tactical Analyst returned malformed Journey Briefing JSON.',
        });
      }
      return res.json({
        ...extracted.value,
        briefing: extracted.value,
      });
    } catch (error: unknown) {
      return respondFailure(req, res, error);
    }
  });

  return router;
}


