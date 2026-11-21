import express from 'express';
import {
  AnalystOverloadError,
  AnalystTimeoutError,
  DEEP_MODEL_ID,
  FAST_MODEL_ID,
  formatFriendlyGeminiError,
  GeminiService,
  isTransientOverloadError,
  type ReasoningMode,
} from '../geminiService.ts';
import {
  buildAnalyzeScreenshotSystemPrompt,
  buildMatchDebriefSystemPrompt,
  buildTacticalChatSystemPrompt,
  normalizePersona,
} from '../prompts.ts';
import {
  ANALYZE_SCREENSHOT_SCHEMA,
  MATCH_DEBRIEF_SCHEMA,
  TACTICAL_CHAT_SCHEMA,
} from '../schemas.ts';
import { createSecurityGuard } from '../middleware/securityGuard.ts';

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

  router.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      app: 'fm27-command-hub',
      hasGeminiKey: gemini.hasApiKey(),
      model: config.geminiModelOverride || DEEP_MODEL_ID,
      fastModel: FAST_MODEL_ID,
      fallbackModel: config.fallbackModel,
      analystTimeoutMs: config.aiTimeoutMs,
    });
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
        text: `Analyze this FM27 screen / match update for ${targetClub} (Event #${eventNum}). User notes: "${notes || 'Extract match statistics, xG, ratings, tactical audit, and generate ready-to-paste Google Docs & Google Sheets sync blocks.'}"`,
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

      const rawText = (response.text ?? '{}').trim();
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawText);
      } catch {
        return res.status(502).json({
          error: 'The Tactical Analyst returned malformed JSON. Please retry.',
        });
      }
      return res.json(parsed);
    } catch (error: unknown) {
      if (error instanceof AnalystTimeoutError) {
        return res.status(504).json({ error: error.message });
      }
      const errMessage =
        error instanceof Error ? error.message : 'Failed to analyze FM27 screen';
      return res.status(500).json({ error: errMessage });
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
        return res.status(500).json({
          error:
            'GEMINI_API_KEY is missing. Please verify your API key in Settings > Secrets.',
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

      if (Array.isArray(history) && history.length > 0) {
        for (const h of history.slice(-14)) {
          if (!h.text || !h.text.trim()) continue;
          contents.push({
            role: h.role === 'user' ? 'user' : 'model',
            parts: [{ text: h.text }],
          });
        }
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

      const rawText = (response.text ?? '{}').trim();
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawText);
      } catch {
        return res.status(502).json({
          error: 'The Tactical Analyst returned malformed JSON. Please retry.',
        });
      }
      return res.json(parsed);
    } catch (error: unknown) {
      if (error instanceof AnalystTimeoutError) {
        return res.status(504).json({ error: error.message });
      }
      if (error instanceof AnalystOverloadError || isTransientOverloadError(error)) {
        return res.status(503).json({ error: formatFriendlyGeminiError(error) });
      }
      return res.status(500).json({ error: formatFriendlyGeminiError(error) });
    }
  });

  router.post('/fm27/match-debrief', guard, async (req, res) => {
    try {
      const { clubName, matchSummary, activeShape } = req.body as {
        clubName?: string;
        matchSummary?: Record<string, unknown>;
        activeShape?: string;
      };

      if (!gemini.hasApiKey()) {
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
                  text: `Generate a structured FM27 Patch 27.1.0 Post-Match Tactical Debrief for this match:\n${compactPayload}`,
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

      const rawText = (response.text ?? '{}').trim();
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawText);
      } catch {
        return res.status(502).json({
          error: 'The Tactical Analyst returned malformed debrief JSON.',
        });
      }
      return res.json(parsed);
    } catch (error: unknown) {
      if (error instanceof AnalystTimeoutError) {
        return res.status(504).json({ error: error.message });
      }
      if (error instanceof AnalystOverloadError || isTransientOverloadError(error)) {
        return res.status(503).json({ error: formatFriendlyGeminiError(error) });
      }
      return res.status(500).json({ error: formatFriendlyGeminiError(error) });
    }
  });

  return router;
}

