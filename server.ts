import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '15mb' }));

  app.post('/api/fm27/analyze-screenshot', async (req, res) => {
    try {
      const { imageBase64, mimeType, notes, nextEventNumber } = req.body as {
        imageBase64?: string;
        mimeType?: string;
        notes?: string;
        nextEventNumber?: number;
      };

      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({
          error:
            'GEMINI_API_KEY is missing. Please verify your API key in Settings > Secrets.',
        });
      }

      const ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const eventNum = nextEventNumber || 34;

      const systemPrompt = `You are Bobby Dean's Football Manager 27 Chief Tactical Analyst for KVV Zelzate (1e Nationale Voetbal Vlaanderen, 2027/28 Season).
Key Club Rules & Context:
- Primary Tactic: 4-3-3 Counter Positive (Balanced Ground Build-Up, Short/Mixed GK Distribution, Standard Passing, Tracking Wingers OOP on both flanks).
- Non-Negotiable Rules:
  1) Never sub off both starting CBs (Brendan Schoonbaert & Brend Leeflang) simultaneously when protecting a lead.
  2) Batch all 5 substitutions into 2 second-half windows (60m-65m and 75m+) so 3 stoppages are never burned early. Always sub Quinten Boudry (Stamina 6) around 62m for Jerayson Hoepel.
  3) Keep 3 midfielders on the pitch (never pull DM for a 4-2-4).
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
        text: `Analyze this FM27 screen / match update for KVV Zelzate (Event #${eventNum}). User notes: "${notes || 'Extract match statistics, xG, ratings, tactical audit, and generate ready-to-paste Google Docs & Google Sheets sync blocks.'}"`,
      });

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
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
                description: 'In-game date in DD/MM/YYYY format (e.g. 18/09/2027)',
              },
              competition: {
                type: Type.STRING,
                description: 'Competition and matchday (e.g. 1st National - VV MD5)',
              },
              opponent: {
                type: Type.STRING,
                description: 'Opponent club name (e.g. Jong Cercle)',
              },
              venue: {
                type: Type.STRING,
                description: 'H for Home or A for Away',
              },
              result: {
                type: Type.STRING,
                description: 'W, D, or L from KVV Zelzate perspective',
              },
              score: {
                type: Type.STRING,
                description: 'Scoreline from KVV Zelzate perspective (e.g. 2 - 0)',
              },
              xGFor: {
                type: Type.NUMBER,
                description: 'KVV Zelzate expected goals (e.g. 1.64)',
              },
              xGAgainst: {
                type: Type.NUMBER,
                description: 'Opponent expected goals (e.g. 0.58)',
              },
              possession: {
                type: Type.NUMBER,
                description: 'KVV Zelzate possession percentage integer (e.g. 42)',
              },
              passCompletion: {
                type: Type.NUMBER,
                description: 'KVV Zelzate pass completion percentage integer (e.g. 84)',
              },
              shotsFor: {
                type: Type.STRING,
                description: 'KVV Zelzate shots (on target) string e.g. 11 (5)',
              },
              shotsAgainst: {
                type: Type.STRING,
                description: 'Opponent shots (on target) string e.g. 8 (2)',
              },
              cccFor: {
                type: Type.NUMBER,
                description: 'KVV Zelzate clear cut chances integer',
              },
              cccAgainst: {
                type: Type.NUMBER,
                description: 'Opponent clear cut chances integer',
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
        nextEventNumber,
        currentSaveDate,
      } = req.body as {
        message?: string;
        history?: Array<{ role: 'user' | 'assistant'; text: string }>;
        images?: Array<{ base64: string; mimeType: string; name?: string }>;
        importedFileContext?: string;
        nextEventNumber?: number;
        currentSaveDate?: string;
      };

      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({
          error:
            'GEMINI_API_KEY is missing. Please verify your API key in Settings > Secrets.',
        });
      }

      const ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const eventNum = nextEventNumber || 34;

      const systemPrompt = `You are Bobby Dean's interactive Football Manager 27 Chief Tactical Analyst & Master Sheet Co-Pilot for KVV Zelzate (Matricule 4165, 1e Nationale Voetbal Vlaanderen, Backline Arena 105m x 68m Grass).

YOUR CORE ROLE IN THIS BACK-AND-FORTH:
Bobby sends you FM27 screenshots (Match Results, Data Hub Last Match, Pass/Shot Maps, Scout Reports, Set Pieces, Player Profiles, Inbox items, Training, or Squad views), FM27 data exports (.csv / Ctrl+P .html / .rtf), .fm save files, or talks through his tactical ideas.
You MUST:
1. Analyze every detail he says and sends using:
   - "Bobby Dean — Portable FM27 Tactics & Journeyman Playbook v2.0" (Patch 27.1.0 baseline: Dual-Phase IP/OOP roles with zero legacy duties, Golden Rule of One Change at a Time, Three-Man Box Rule, Tactical Effectiveness 8 familiarity areas where Chance Creation & Pressing Intensity carry the highest match weight, 15 Team & 6 Individual Tactical Tweaks macros, 6 mood-based Shouts, 3-player downward-only Mentoring units, Post-Match full Rest day slashing training injury roll from 13.8% to 4.0%, and Physical Engine weights: Pace, Acceleration, Jumping Reach, Stamina, Condition, Sharpness).
   - "KVV Zelzate Live Master Sheet (Tables 1A–1K & 28-Man Squad Attributes/Per-90 Stats)" currently at Save Date ${currentSaveDate || 'Wed 15/09/2027 (Post-MD4 vs Royal Knokke FC, 6th Place, 6 Pts, 4.27 xGF vs 4.01 xGA, preparing for Sat 18/09/2027 MD5 Away vs 16th-placed Jong Cercle)'}.
2. HANDLE DECODED .FM SAVE FILES & FM27 EXPORTS WITH 100% PRECISION:
   - When Bobby uploads his .fm save file, the app decodes it locally in-browser via fmsave 0.14.1 (Python 3.14 WebAssembly) and passes you the LIVE ground-truth data: exact current in-game date, managed club, live league table & next opponent standing, live club finances & wage payroll, recent played matches with xG/shots/possession/CCC, upcoming fixture calendar, active injuries, mentoring groups, and all managed squad players with live CA/PA, attributes, condition/sharpness, wages, and season stats!
   - When this [LIVE FULL .FM SAVE DECODED VIA FMSAVE ...] block is present:
     a) Audit EVERY newly played match and squad/attribute diff since the previous checkpoint against Playbook v2.0.
     b) Highlight live CA/PA insights, attribute gains/drops (e.g. Mentoring Determination gains), condition/sharpness flags, injuries/suspensions, and wage budget compliance.
     c) Produce a **COMPLETE ACTION PLAN FROM THE EXACT IN-GAME DATE FORWARD**: exact rotated Starting XI + Bench + 62m/75m substitution windows for the next fixture, multi-match load management across the upcoming schedule, training/mentoring tweaks, and transfer/wage actions.
   - If Bobby drops FM27 .csv / .html / .rtf exports or screenshots instead, analyze every stat/attribute change and deliver the same complete forward plan. Never fabricate numbers not present in the provided data.
3. Enforce KVV Zelzate's Non-Negotiable Club Rules:
   - Rule #1: NEVER sub off both starting CBs (#8 Brendan Schoonbaert JR 15, 92% hdrs & #4 Brend Leeflang 100% tck) simultaneously when protecting a lead.
   - Rule #2: Batch all 5 substitutions across at most 2 second-half windows (60m–65m and 75m+, plus optional HT free stoppage) so 3 stoppages are never burned early. Always sub #23 Quinten Boudry (Stamina 6) around 62m for #9 Jerayson Hoepel.
   - Rule #3: Keep 3 midfielders on the pitch late (never pull DM for a 4-2-4 when chasing; use FM27 Touchline Tweaks "Play With More Urgency" + "Swap Wings" + Shout "Up Your Game" instead).
   - Rule #4: Both wide forwards (#23 Boudry & #12 Nathan Karinda) use Tracking Winger OOP (switched from WOW after Bruce Deuwel's 18' overlap goal for Knokke). Both Slot 1 (Home) and Slot 2 (Away) use Balanced Ground Build-Up, Short/Mixed GK Distribution to CBs (#13 René Vanden Borre), and Standard Passing Directness.
   - Rule #5: Table 1K 180-Minute Double-GW Load Cap (<=125m for standard outfielders across Wed 15/09 Knokke & Sat 18/09 Jong Cercle): Rotate in 100% fresh #3 Lazarus Nkemdirim (LB, 90m), #22 Tijs Temmerman (RB, 62m), #27 Rune Bogaert (DM, 62m), and #20 Sander Dieltjens (LCM, 90m) at Jong Cercle.
   - Rule #6: Defending Corners Routine 1 is a 43/43 (100%) shutout wall with Tracker B2 #6 Søren Coens stationed at Edge of Area. Attacking Corners Routine 2 (Inswinger: Aim For Centre) is primary active (Polizzi L-foot right side, Karinda R-foot left side; A1 Schoonbaert Near Post, A2 Epolo Mark Keeper, A3 Leeflang Far Post, B1 Polizzi/Karinda Edge of Area, C1 Coens Near, C2 Boudry Far, D3 Melkebeke Lurk Centre, D1 Nkemdirim & D2 Devos Stay Back).
4. Structure your response clearly with:
   - **STEP A — AUTOMATIC SCREEN/FILE DETECTION, AUDIT & FORWARD PLAN FROM CURRENT IN-GAME DATE** (Detailed Markdown breakdown referencing exact player numbers, attributes, per-90 stats, and Playbook v2.0 mechanics).
   - **3 Immediate In-Game Clicks** before hitting Continue.
   - **Master Sheet & Google Doc Auto-Update Payloads**: Populate the structured JSON fields so the app can update Table 1G (Match Log), Table 1H (Opposition Scouting), Table 1I (Set-Piece/Tactical Audit), Tab 10 (Chronicles Event #${eventNum}), and the Master Google Doc in one click.`;

      const parts: Array<
        | { text: string }
        | { inlineData: { mimeType: string; data: string } }
      > = [];

      if (Array.isArray(history) && history.length > 0) {
        const transcript = history
          .slice(-6)
          .map((h) => `${h.role === 'user' ? 'Bobby' : 'Chief Analyst'}: ${h.text}`)
          .join('\n\n');
        parts.push({
          text: `RECENT CONVERSATION CONTEXT:\n${transcript}`,
        });
      }

      if (importedFileContext && importedFileContext.trim().length > 0) {
        parts.push({
          text: `IMPORTED FM27 SAVE / EXPORT PAYLOAD:\n${importedFileContext}`,
        });
      }

      if (Array.isArray(images)) {
        for (const img of images) {
          if (img.base64 && img.mimeType) {
            parts.push({
              inlineData: {
                mimeType: img.mimeType,
                data: img.base64,
              },
            });
          }
        }
      }

      parts.push({
        text: `Bobby's Message / Screen / File Submission (Target Next Chronicle Event #${eventNum}):\n${
          message ||
          'Analyze the attached FM27 file(s) / screenshot(s) against our Playbook v2.0 and KVV Zelzate Master Sheet, update everything possible, and produce a complete tactical & squad plan from the current in-game date.'
        }`,
      });

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: { parts },
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              screenDetected: {
                type: Type.STRING,
                description: 'Detected FM27 screen type(s) and in-game date',
              },
              inGameDate: {
                type: Type.STRING,
                description: 'In-game date in DD/MM/YYYY format',
              },
              analysisMarkdown: {
                type: Type.STRING,
                description:
                  'Complete, in-depth Markdown tactical & Data Hub analysis (Step A) responding directly to Bobby in our signature back-and-forth style, citing exact players, attributes, and Playbook v2.0 rules.',
              },
              immediateClicks: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description:
                  '3 concrete, numbered in-game clicks/actions for Bobby before hitting Continue',
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
                description: 'Headline result, metric, or status for Chronicles',
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
                  '6 or 7 column values matching the detected Master Sheet table row (e.g. Table 1G, Table 1H, or Table 1I) ready to append directly to Google Sheets',
              },
              isMatchResult: {
                type: Type.BOOLEAN,
                description:
                  'True if this submission contains a completed match result to add to Table 1G',
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
                  'Any KVV Zelzate squad player stat, rating, attribute, injury, or tactical note updates extracted from the screenshot or message so the 28-Man Squad Table updates automatically',
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: {
                      type: Type.STRING,
                      description: 'Exact player name (e.g. Matteo Polizzi, Sander Dieltjens, Mbey Epolo)',
                    },
                    rating: {
                      type: Type.NUMBER,
                      description: 'Updated or latest match rating if shown',
                    },
                    goalsAdded: {
                      type: Type.NUMBER,
                      description: 'Goals scored in this new match to add to total',
                    },
                    assistsAdded: {
                      type: Type.NUMBER,
                      description: 'Assists in this new match to add to total',
                    },
                    minutesAdded: {
                      type: Type.NUMBER,
                      description: 'Minutes played in this new match to add to total',
                    },
                    notes: {
                      type: Type.STRING,
                      description: 'Updated tactical, scouting, mentoring, or medical report note for this player',
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

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`FM27 Command Hub running on http://localhost:${PORT}`);
  });
}

startServer();
