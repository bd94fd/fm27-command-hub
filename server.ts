import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

dotenv.config();

const DEFAULT_GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-pro';
const FAST_GEMINI_MODEL = process.env.GEMINI_FAST_MODEL || 'gemini-2.5-flash';

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '100mb' }));
  app.use(express.urlencoded({ limit: '100mb', extended: true }));

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      app: 'fm27-command-hub',
      hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
      model: DEFAULT_GEMINI_MODEL,
      fastModel: FAST_GEMINI_MODEL,
    });
  });

  app.post('/api/fm27/analyze-screenshot', async (req, res) => {
    try {
      const { imageBase64, mimeType, notes, nextEventNumber, clubName } =
        req.body as {
          imageBase64?: string;
          mimeType?: string;
          notes?: string;
          nextEventNumber?: number;
          clubName?: string;
        };

      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({
          error:
            'GEMINI_API_KEY is missing. Set GEMINI_API_KEY in your .env file or cloud environment variables.',
        });
      }

      const ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
      });

      const eventNum = nextEventNumber || 1;
      const targetClub = clubName || 'the managed club';

      const systemPrompt = `You are Bobby Dean's Football Manager 27 Chief Tactical Analyst for ${targetClub} (Patch 27.1.0 Playbook v2.0).
Key Playbook v2.0 Rules:
- Primary System: Dual-Phase 4-3-3 Counter Positive (Balanced Ground Build-Up, Short/Mixed GK Distribution, Standard Passing, Tracking Wingers OOP on both flanks to prevent 2v1 full-back overlaps).
- Non-Negotiable Guardrails:
  1) Never sub off both starting CBs simultaneously when protecting a lead.
  2) Batch all 5 substitutions into at most 2 second-half windows (62m and 75m+, plus optional HT free stoppage) so 3 stoppages are never burned early.
  3) Keep 3 midfielders on the pitch late (never pull DM for a 4-2-4; use Play With More Urgency + Swap Wings instead).
  4) NEVER invent, fabricate, or guess any player stats, match xG, scores, wages, or dates not visible in the screenshot or user notes.
  5) NEVER cite or mention raw numeric CA/PA values—use relative star ratings and FM27 engine metrics only. Never use retired FM24 roles (Mezzala, Enganche, Trequartista, etc.) or legacy Defend/Support/Attack duties.
- Analyze the uploaded FM27 screenshot or match notes and output structured JSON ready for Event #${eventNum}.`;

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

      const response = await ai.models.generateContent({
        model: DEFAULT_GEMINI_MODEL,
        contents: { parts },
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              screenDetected: {
                type: Type.STRING,
                description: 'Detected FM27 screen type and in-game date',
              },
              inGameDate: {
                type: Type.STRING,
                description: 'In-game date in DD/MM/YYYY format',
              },
              competition: {
                type: Type.STRING,
                description: 'Competition and matchday',
              },
              opponent: {
                type: Type.STRING,
                description: 'Opponent club name',
              },
              venue: {
                type: Type.STRING,
                description: 'H for Home or A for Away',
              },
              result: {
                type: Type.STRING,
                description: 'W, D, or L from managed club perspective',
              },
              score: {
                type: Type.STRING,
                description: 'Scoreline from managed club perspective (e.g. 2 - 0)',
              },
              xGFor: {
                type: Type.NUMBER,
                description: 'Managed club expected goals if explicitly visible',
              },
              xGAgainst: {
                type: Type.NUMBER,
                description: 'Opponent expected goals if explicitly visible',
              },
              possession: {
                type: Type.NUMBER,
                description: 'Managed club possession percentage integer if visible',
              },
              passCompletion: {
                type: Type.NUMBER,
                description: 'Managed club pass completion percentage integer if visible',
              },
              shotsFor: {
                type: Type.STRING,
                description: 'Managed club shots (on target) string if visible',
              },
              shotsAgainst: {
                type: Type.STRING,
                description: 'Opponent shots (on target) string if visible',
              },
              cccFor: {
                type: Type.NUMBER,
                description: 'Managed club clear cut chances integer if visible',
              },
              cccAgainst: {
                type: Type.NUMBER,
                description: 'Opponent clear cut chances integer if visible',
              },
              goalTimeline: {
                type: Type.STRING,
                description: 'Minute-by-minute goal scorers and assists',
              },
              potm: {
                type: Type.STRING,
                description: 'Player of the Match name, rating, and key stats',
              },
              defensiveWatchpoints: {
                type: Type.STRING,
                description: 'Defensive unit ratings and tactical watchpoints',
              },
              headlineTitle: {
                type: Type.STRING,
                description: 'Match fixture or event title',
              },
              outcomeMetric: {
                type: Type.STRING,
                description: 'Result, scoreline, and xG summary',
              },
              executiveBullets: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '3-4 sharp tactical & Data Hub insights',
              },
              recommendedClicks: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: '3 immediate in-game clicks before hitting Continue',
              },
              tacticalAuditSummary: {
                type: Type.STRING,
                description: '1-paragraph synthesis for Table 1G & Chronicles',
              },
            },
            required: [
              'screenDetected',
              'inGameDate',
              'headlineTitle',
              'outcomeMetric',
              'executiveBullets',
              'recommendedClicks',
              'tacticalAuditSummary',
            ],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      return res.json(parsed);
    } catch (error: unknown) {
      const errMessage =
        error instanceof Error ? error.message : 'Failed to analyze FM27 screen';
      return res.status(500).json({ error: errMessage });
    }
  });

  app.post('/api/fm27/tactical-chat', async (req, res) => {
    try {
      const {
        message,
        history,
        images,
        importedFileContext,
        liveAppContext,
        reasoningMode,
        nextEventNumber,
        currentSaveDate,
        clubName,
      } = req.body as {
        message?: string;
        history?: Array<{ role: 'user' | 'assistant'; text: string }>;
        images?: Array<{ base64: string; mimeType: string; name?: string }>;
        importedFileContext?: string;
        liveAppContext?: string;
        reasoningMode?: 'deep_high' | 'max_xhigh' | 'fast_lite';
        nextEventNumber?: number;
        currentSaveDate?: string;
        clubName?: string;
      };

      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({
          error:
            'GEMINI_API_KEY is missing. Please verify your API key in Settings > Secrets.',
        });
      }

      const ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
      });

      const eventNum = nextEventNumber || 1;
      const targetClub =
        clubName && clubName !== '--' ? clubName : 'the manager’s club';

      const selectedModel =
        reasoningMode === 'fast_lite'
          ? FAST_GEMINI_MODEL
          : DEFAULT_GEMINI_MODEL;

      const thinkingConfig =
        reasoningMode === 'max_xhigh'
          ? { thinkingLevel: ThinkingLevel.HIGH }
          : reasoningMode === 'fast_lite'
            ? { thinkingLevel: ThinkingLevel.LOW }
            : { thinkingLevel: ThinkingLevel.HIGH };

      const systemPrompt = `You are Bobby Dean's interactive Football Manager 27 Chief Tactical Analyst, Match Engine Physicist & Master Sheet Co-Pilot for ${targetClub}.

STRICT FM27 ACCURACY & RATING POLICY:
- Always cross-check tactical, match-engine, training, set-piece, and SCR mechanics against the VERIFIED FM27 KNOWLEDGE BASE block included in the context.
- NEVER mention, reveal, or guess raw numeric CA or PA values (e.g. "CA 120 / PA 140"). Always use relative Star Ratings (e.g. 3.5★/4.5★), visible attributes, and FM27 Engine Metrics (Sprint Speed m/s, Aerial Jump Height, Physical Score /100).
- NEVER recommend retired FM24 roles (Mezzala, Enganche, Trequartista, Carrilero, Raumdeuter, Segundo Volante) or legacy Defend/Support/Attack duties. Always pair authentic FM27 In-Possession (IP) and Out-of-Possession (OOP) roles.

YOUR CORE IDENTITY & CONVERSATIONAL INTELLIGENCE:
You are having an ongoing, multi-turn back-and-forth tactical working session with the manager.
1. **Deep FM27 Match Engine Mastery (Patch 27.1.0 & Playbook v2.0)**:
   - You understand how FM27's Dual-Phase In-Possession (IP) and Out-of-Possession (OOP) role pairs interact in every phase of play (build-up, progression, final-third creation, counter-press, high/mid block, and defensive transitions).
   - You know why **Tracking Winger (TW) OOP** on both AML and AMR stops 2v1 full-back overlaps (whereas Wide Outlet Winger OOP leaves flanks exposed), why **Balanced Ground Build-Up + Short/Mixed GK Distribution + Standard Passing Directness** prevents cheap turnover cascades, and how Patch 27.1.0 weights **Pace, Acceleration, Jumping Reach, Stamina, Anticipation, Decisions, Work Rate, and First Touch**.
   - You enforce Playbook v2.0's 5 Non-Negotiable Touchline & Periodisation Laws:
     * **The Golden Rule**: Change 1 structural variable at a time and observe 20–25 in-game minutes.
     * **Dual-CB 90m Continuity Lock**: Never substitute both starting Centre-Backs simultaneously when protecting a lead or parity.
     * **2-Window Substitution Script**: Batch all 5 subs into at most 2 second-half stoppages — Window 1 (60'–63') for your 2–3 lowest-Stamina non-CB starters, Window 2 (75'+) for 1–2 fresh closers (plus optional HT 45' free window).
     * **3-Man Midfield Zone 5 Guardrail**: Never pull the holding DM for a 4-2-4 when chasing late; keep 3 midfielders on the pitch and use Touchline Tweaks ("Play With More Urgency" + "Swap Wings") + Shout "Up Your Game".
     * **180-Minute Double-GW Stamina Cap & Post-Match Rest Law**: Keep standard outfielders <= 125 combined minutes across Wed/Sat double gameweeks and schedule a full Post-Match Rest day (cuts training injury roll from 13.8% to 4.0%).

2. **Context-Aware Multi-Turn Conversation & Memory**:
   - Always pay close attention to the **multi-turn conversation history** and the **LIVE IN-APP COMMAND HUB CONTEXT** provided below.
   - If the manager asks a follow-up question ("Why him over X?", "What if we face a 3-5-2 next?", "Who takes corners if he's benched?", "Switch him to Inside Forward IP and mark him as Starter", "How should we adjust at half-time if we're 0-1 down?"), directly answer their specific question first, referencing what you and the manager discussed in previous turns AND the live squad/fixture data in the app.
   - Do NOT repeat a generic boilerplate essay if the manager asked a targeted question—tailor your markdown headings, tactical reasoning, player comparisons, and 3 Immediate In-Game Clicks directly to the manager's message and the current context.
   - Whenever the manager asks to change a player's IP role, OOP role, starter/rotation status, rating, stats, or tactical note (or when a screenshot/message reveals new player ratings, goals, assists, minutes, or roles), populate \`playerUpdates\` so the in-app Squad Database and War Room update automatically!

3. **Strict Anti-Fabrication Rule (Zero Made-Up Data)**:
   - NEVER invent, guess, or fabricate any player names, player stats, match xG, possession percentages, scores, wages, or dates that are not present in the live in-app context, newly imported file, screenshot, or conversation history.
   - If no .fm save has been imported yet (0 players in the live context), answer the manager's FM27 tactical or match-engine question thoroughly using Playbook v2.0 & Patch 27.1.0 principles without inventing fake squad members.

${liveAppContext ? `\n${liveAppContext}\n` : ''}`;

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

      const response = await ai.models.generateContent({
        model: selectedModel,
        contents,
        config: {
          systemInstruction: systemPrompt,
          thinkingConfig,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              screenDetected: {
                type: Type.STRING,
                description:
                  'Concise label of what you analyzed on this turn (e.g. "Tactical Follow-Up: Flank Overload & Role Pairing", "Live .fm Save Full Club Audit", "Data Hub Match Report", etc.)',
              },
              inGameDate: {
                type: Type.STRING,
                description: 'In-game date in DD/MM/YYYY format (or "--" if not yet loaded)',
              },
              analysisMarkdown: {
                type: Type.STRING,
                description:
                  'Clever, context-aware Markdown response directly answering the manager’s question or auditing the save/screenshot using FM27 Patch 27.1.0 physics, Dual-Phase IP/OOP mechanics, Playbook v2.0 rules, and the live squad/fixture data without fabricating any missing numbers.',
              },
              immediateClicks: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description:
                  '3 concrete, numbered in-game clicks/actions tailored to this exact turn',
              },
              followUpQuestions: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description:
                  '3 smart, context-aware follow-up questions or tactical scenarios the manager can click next to continue this conversation',
              },
              targetSheetTable: {
                type: Type.STRING,
                description:
                  'Which Master Sheet table this update belongs to: TABLE_1G_MATCH_LOG, TABLE_1H_SCOUTING, TABLE_1I_TACTICAL_AUDIT, or GENERAL_CHRONICLE',
              },
              chronicleTitle: {
                type: Type.STRING,
                description: 'Title for Event # in Master Doc & Tab 10 Chronicles',
              },
              chronicleOutcomeMetric: {
                type: Type.STRING,
                description: 'Headline result, metric, or tactical decision summary for Chronicles',
              },
              docEventBulletBlock: {
                type: Type.STRING,
                description:
                  'Ready-to-insert flat bullet block (using ● and -) for Event # in Section 5 of the Master Google Doc above [INSERT NEXT CHRONOLOGICAL EVENT HERE]',
              },
              sheetRowValues: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description:
                  '6 or 7 column values matching the detected Master Sheet table row ready to append directly to Google Sheets',
              },
              isMatchResult: {
                type: Type.BOOLEAN,
                description:
                  'True ONLY if this submission reports a newly completed match result not already in the Match Log',
              },
              matchFields: {
                type: Type.OBJECT,
                properties: {
                  competition: { type: Type.STRING },
                  opponent: { type: Type.STRING },
                  venue: { type: Type.STRING },
                  result: { type: Type.STRING },
                  score: { type: Type.STRING },
                  xGFor: { type: Type.NUMBER },
                  xGAgainst: { type: Type.NUMBER },
                  possession: { type: Type.NUMBER },
                  passCompletion: { type: Type.NUMBER },
                  shotsFor: { type: Type.STRING },
                  shotsAgainst: { type: Type.STRING },
                  cccFor: { type: Type.NUMBER },
                  cccAgainst: { type: Type.NUMBER },
                  goalTimeline: { type: Type.STRING },
                  potm: { type: Type.STRING },
                  defensiveWatchpoints: { type: Type.STRING },
                  tacticalAudit: { type: Type.STRING },
                },
              },
              playerUpdates: {
                type: Type.ARRAY,
                description:
                  'Any squad player IP/OOP role changes, status changes (Starter/Rotation/Youth/Injured), rating, goals, assists, minutes, condition, or tactical note updates agreed upon in this chat turn or extracted from a screenshot',
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: {
                      type: Type.STRING,
                      description: 'Exact player name from the squad',
                    },
                    ipRole: {
                      type: Type.STRING,
                      description: 'Updated In-Possession (IP) role if changed or recommended',
                    },
                    oopRole: {
                      type: Type.STRING,
                      description: 'Updated Out-of-Possession (OOP) role if changed or recommended',
                    },
                    status: {
                      type: Type.STRING,
                      description: 'Updated squad status if changed: Starter, Rotation, Youth, or Injured',
                    },
                    condition: {
                      type: Type.NUMBER,
                      description: 'Updated condition percentage (1-100) if explicitly reported',
                    },
                    rating: {
                      type: Type.NUMBER,
                      description: 'Updated or latest match rating if explicitly shown',
                    },
                    goalsAdded: {
                      type: Type.NUMBER,
                      description: 'Goals scored in a new match to add to total',
                    },
                    assistsAdded: {
                      type: Type.NUMBER,
                      description: 'Assists in a new match to add to total',
                    },
                    minutesAdded: {
                      type: Type.NUMBER,
                      description: 'Minutes played in a new match to add to total',
                    },
                    notes: {
                      type: Type.STRING,
                      description: 'Updated tactical, role, scouting, mentoring, or medical report note for this player',
                    },
                  },
                  required: ['name', 'notes'],
                },
              },
            },
            required: [
              'screenDetected',
              'inGameDate',
              'analysisMarkdown',
              'immediateClicks',
              'followUpQuestions',
              'targetSheetTable',
              'chronicleTitle',
              'chronicleOutcomeMetric',
              'docEventBulletBlock',
              'sheetRowValues',
              'isMatchResult',
            ],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      return res.json(parsed);
    } catch (error: unknown) {
      const errMessage =
        error instanceof Error
          ? error.message
          : 'Failed to run FM27 Tactical Analyst chat';
      return res.status(500).json({ error: errMessage });
    }
  });

  app.use(
    (
      err: { type?: string; status?: number; name?: string; message?: string },
      _req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      if (
        err &&
        (err.type === 'entity.too.large' ||
          err.status === 413 ||
          err.name === 'PayloadTooLargeError')
      ) {
        return res.status(413).json({
          error:
            'Request payload was too large. Reminder: .fm save files are decoded 100% locally in your browser and never sent raw to the server, and attached screenshots are automatically compressed.',
        });
      }
      return next(err);
    }
  );

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`FM27 Command Hub running on http://localhost:${PORT}`);
  });
}

startServer();
