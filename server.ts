import 'dotenv/config';
import { GoogleGenAI, Type } from '@google/genai';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { PLAYBOOK_V2_SUMMARY_FOR_AI } from './src/data/playbookV2';
import { createEmptyAiContext, createEmptySnapshot } from './src/domain/emptyState';
import { expandSlashCommand } from './src/domain/filters';
import { runContextualFmTools } from './src/domain/fmTools';
import type {
  AiContextState,
  PositionCode,
  RecruitmentCase,
  ShortlistRecord,
  SyncTurnOutput,
  TacticDefinition,
  TacticSlot,
  WorkspaceSnapshot,
} from './src/domain/types';

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

// Clean "Awaiting .fm Save" runtime state — zero fake/mock players, clubs, or matches
let snapshot: WorkspaceSnapshot = createEmptySnapshot();
let recruitmentCases: RecruitmentCase[] = [];
let shortlists: ShortlistRecord[] = [];
let aiContext: AiContextState = createEmptyAiContext();

function getDefaultDualPhase433Slots(): TacticSlot[] {
  const layout: Array<[PositionCode, string, string]> = [
    ['GK', 'Goalkeeper', 'Sweeper Keeper'],
    ['DR', 'Full-Back', 'Full-Back'],
    ['DC', 'Centre-Back', 'Centre-Back'],
    ['DC', 'Ball-Playing Centre-Back', 'Centre-Back'],
    ['DL', 'Full-Back', 'Full-Back'],
    ['DM', 'Defensive Midfielder', 'Defensive Midfielder'],
    ['MC', 'Central Midfielder', 'Screening Central Midfielder'],
    ['MC', 'Channel Midfielder', 'Central Midfielder'],
    ['AMR', 'Winger', 'Tracking Winger'],
    ['AML', 'Inside Forward', 'Tracking Winger'],
    ['ST', 'Channel Forward', 'Central Outlet Centre Forward'],
  ];
  return layout.map(([position, inPossessionRole, outOfPossessionRole], slotIndex) => ({
    slotIndex,
    position,
    inPossessionRole,
    outOfPossessionRole,
  }));
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in the server environment.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function generateWithRetry(
  ai: GoogleGenAI,
  params: {
    contents: unknown;
    systemInstruction: string;
    responseMimeType?: string;
    responseSchema?: unknown;
  },
): Promise<string> {
  const modelsToTry = ['gemini-4-hydrogen', 'gemini-4-hydrogen', 'gemini-2.5-flash'] as const;
  let lastError: unknown = null;

  for (let attempt = 0; attempt < modelsToTry.length; attempt++) {
    const model = modelsToTry[attempt];
    try {
      if (attempt === 1) {
        await new Promise((r) => setTimeout(r, 600));
      }
      const config: Record<string, unknown> = {
        systemInstruction: params.systemInstruction,
      };
      if (params.responseMimeType) {
        config.responseMimeType = params.responseMimeType;
      }
      if (params.responseSchema) {
        config.responseSchema = params.responseSchema;
      }

      const response = await ai.models.generateContent({
        model,
        contents: params.contents as never,
        config: config as never,
      });
      const text = response.text?.trim() ?? '';
      if (text) {
        return text;
      }
    } catch (attemptErr: unknown) {
      lastError = attemptErr;
      const errStr = attemptErr instanceof Error ? attemptErr.message : String(attemptErr);
      const isTransient =
        errStr.includes('503') ||
        errStr.includes('UNAVAILABLE') ||
        errStr.includes('high demand') ||
        errStr.includes('429') ||
        errStr.includes('RESOURCE_EXHAUSTED');
      if (!isTransient) {
        throw attemptErr;
      }
      console.warn(
        `[FM27 Command Hub] Transient error on ${model} (attempt ${attempt + 1}/${modelsToTry.length}): ${errStr}`,
      );
    }
  }

  if (lastError) {
    throw lastError;
  }
  return '';
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '50mb' }));

  // === Snapshot API ===
  app.get('/api/snapshot', (_req, res) => {
    res.json(snapshot);
  });

  app.post('/api/snapshot/import', (req, res) => {
    const customSnapshot = req.body?.snapshot as Partial<WorkspaceSnapshot> | undefined;
    const managedClubName = req.body?.managedClubName as string | null | undefined;
    const importedTactics = req.body?.tactics as TacticDefinition[] | undefined;

    if (
      !customSnapshot ||
      !Array.isArray(customSnapshot.players) ||
      !Array.isArray(customSnapshot.clubs)
    ) {
      return res.status(400).json({ error: 'Invalid FM snapshot payload.' });
    }

    const base = createEmptySnapshot();
    const resolvedClubName =
      managedClubName && managedClubName.trim()
        ? managedClubName.trim()
        : customSnapshot.metadata?.managedClubName ?? customSnapshot.clubs[0]?.name ?? null;

    snapshot = {
      ...base,
      ...customSnapshot,
      matchLogs: Array.isArray(customSnapshot.matchLogs) ? customSnapshot.matchLogs : [],
      tactics: Array.isArray(customSnapshot.tactics)
        ? customSnapshot.tactics
        : Array.isArray(importedTactics)
          ? importedTactics
          : [],
      activeInjuries: Array.isArray(customSnapshot.activeInjuries)
        ? customSnapshot.activeInjuries
        : [],
      mentoring: Array.isArray(customSnapshot.mentoring) ? customSnapshot.mentoring : [],
      finances: customSnapshot.finances ?? null,
      leagueStanding: customSnapshot.leagueStanding ?? null,
      metadata: {
        ...base.metadata,
        ...customSnapshot.metadata,
        status: 'loaded',
        loadedAt: new Date().toISOString(),
        freshness: 'current',
        managedClubName: resolvedClubName,
        totalPlayersInWorld:
          customSnapshot.metadata?.totalPlayersInWorld || customSnapshot.players.length,
        totalStaffInWorld:
          customSnapshot.metadata?.totalStaffInWorld || customSnapshot.staff?.length || 0,
        totalClubsInWorld:
          customSnapshot.metadata?.totalClubsInWorld || customSnapshot.clubs.length,
        totalCompetitionsInWorld:
          customSnapshot.metadata?.totalCompetitionsInWorld ||
          customSnapshot.competitions?.length ||
          0,
      },
    };

    const nextTactics =
      Array.isArray(importedTactics) && importedTactics.length > 0
        ? importedTactics
        : snapshot.tactics.length > 0
          ? snapshot.tactics
          : aiContext.tactics;

    aiContext = {
      ...aiContext,
      managedClubName: resolvedClubName,
      includeManagedClub: Boolean(resolvedClubName),
      tactics: nextTactics,
      activeTacticId:
        nextTactics.length > 0 ? nextTactics[0].id : aiContext.activeTacticId,
      includeTactic: nextTactics.length > 0,
    };

    res.json({ snapshot, aiContext });
  });

  app.post('/api/snapshot/reset', (_req, res) => {
    snapshot = createEmptySnapshot();
    aiContext = createEmptyAiContext();
    recruitmentCases = [];
    shortlists = [];
    res.json({ snapshot, aiContext });
  });

  // === Recruitment Evidence API ===
  app.get('/api/recruitment', (_req, res) => {
    res.json({
      gameDate: snapshot.metadata.gameDate,
      cases: recruitmentCases,
    });
  });

  app.post('/api/recruitment', (req, res) => {
    const body = req.body as Partial<RecruitmentCase>;
    if (!body.playerName?.trim()) {
      return res.status(400).json({ error: 'Player name is required.' });
    }
    const defaultDate = snapshot.metadata.gameDate || new Date().toISOString().slice(0, 10);
    const created: RecruitmentCase = {
      id: `rec-${Date.now()}`,
      playerId: body.playerId ?? null,
      playerName: body.playerName.trim(),
      club: (body.club ?? '').trim() || 'Free Agent',
      interestStatus: body.interestStatus ?? 'Interested',
      dealStage: body.dealStage ?? 'Scouted',
      source: (body.source ?? 'Scout Report').trim(),
      observedGameDate: body.observedGameDate || defaultDate,
      validUntilGameDate: body.validUntilGameDate || defaultDate,
      notes: (body.notes ?? '').trim(),
    };
    recruitmentCases = [created, ...recruitmentCases];
    res.status(201).json(created);
  });

  app.patch('/api/recruitment/:id', (req, res) => {
    const idx = recruitmentCases.findIndex((c) => c.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Recruitment case not found.' });
    recruitmentCases[idx] = { ...recruitmentCases[idx], ...req.body, id: recruitmentCases[idx].id };
    res.json(recruitmentCases[idx]);
  });

  app.delete('/api/recruitment/:id', (req, res) => {
    recruitmentCases = recruitmentCases.filter((c) => c.id !== req.params.id);
    res.json({ ok: true });
  });

  app.post('/api/recruitment/clear-expired', (_req, res) => {
    const today = snapshot.metadata.gameDate;
    if (!today) {
      return res.json({ removed: 0, cases: recruitmentCases });
    }
    const before = recruitmentCases.length;
    recruitmentCases = recruitmentCases.filter((c) => c.validUntilGameDate >= today);
    res.json({ removed: before - recruitmentCases.length, cases: recruitmentCases });
  });

  // === Shortlists API ===
  app.get('/api/shortlists', (_req, res) => {
    res.json(shortlists);
  });

  app.post('/api/shortlists', (req, res) => {
    const { name, notes, playerIds, createdBy } = req.body as Partial<ShortlistRecord>;
    if (!name?.trim()) {
      return res.status(400).json({ error: 'Shortlist name is required.' });
    }
    const created: ShortlistRecord = {
      id: `sl-${Date.now()}`,
      name: name.trim(),
      createdBy: createdBy === 'AI assistant' ? 'AI assistant' : 'Manager',
      createdAt: snapshot.metadata.gameDate,
      notes: (notes ?? '').trim(),
      playerIds: Array.isArray(playerIds) ? Array.from(new Set(playerIds)) : [],
    };
    shortlists = [created, ...shortlists];
    res.status(201).json(created);
  });

  app.post('/api/shortlists/:id/players', (req, res) => {
    const sl = shortlists.find((s) => s.id === req.params.id);
    if (!sl) return res.status(404).json({ error: 'Shortlist not found.' });
    const playerId = Number(req.body?.playerId);
    if (!Number.isFinite(playerId)) return res.status(400).json({ error: 'Invalid playerId.' });
    if (!sl.playerIds.includes(playerId)) {
      sl.playerIds = [...sl.playerIds, playerId];
    }
    res.json(sl);
  });

  app.delete('/api/shortlists/:id', (req, res) => {
    shortlists = shortlists.filter((s) => s.id !== req.params.id);
    res.json({ ok: true });
  });

  // === AI Context (Managed Club & Dual-Phase Tactics) API ===
  app.get('/api/context', (_req, res) => {
    res.json(aiContext);
  });

  app.put('/api/context', (req, res) => {
    const { managedClubName, includeManagedClub, activeTacticId, includeTactic } =
      req.body as Partial<AiContextState>;
    aiContext = {
      ...aiContext,
      managedClubName:
        managedClubName !== undefined ? managedClubName : aiContext.managedClubName,
      includeManagedClub: includeManagedClub ?? aiContext.includeManagedClub,
      activeTacticId:
        activeTacticId !== undefined ? activeTacticId : aiContext.activeTacticId,
      includeTactic: includeTactic ?? aiContext.includeTactic,
    };
    res.json(aiContext);
  });

  app.post('/api/context/tactics', (req, res) => {
    const body = req.body as Partial<TacticDefinition>;
    if (!body.name?.trim()) {
      return res.status(400).json({ error: 'Tactic name is required.' });
    }
    const created: TacticDefinition = {
      id: `tactic-${Date.now()}`,
      fileName:
        body.fileName || `${body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.fmf`,
      name: body.name.trim(),
      formation: body.formation || '4-3-3 DM Wide',
      mentality: body.mentality || 'Positive',
      tacticalStyle: body.tacticalStyle || 'Fluid Counter-Attack',
      inPossessionInstructions: body.inPossessionInstructions ?? ['Balanced Ground Build-Up'],
      inTransitionInstructions: body.inTransitionInstructions ?? ['Counter-Attack'],
      outOfPossessionInstructions: body.outOfPossessionInstructions ?? [
        'Mid Block',
        'Trigger Press More Often',
      ],
      lastModified: snapshot.metadata.gameDate,
      slots:
        body.slots && body.slots.length === 11 ? body.slots : getDefaultDualPhase433Slots(),
    };
    aiContext = {
      ...aiContext,
      tactics: [created, ...aiContext.tactics],
      activeTacticId: created.id,
      includeTactic: true,
    };
    res.status(201).json(aiContext);
  });

  // === Unified Grounded AI Chat Endpoint ===
  app.post('/api/ai/chat', async (req, res) => {
    const rawMessage = String(req.body?.message ?? '').trim();
    const history = Array.isArray(req.body?.history)
      ? (req.body.history as { role: 'user' | 'assistant'; content: string }[]).slice(-8)
      : [];
    const images = Array.isArray(req.body?.images)
      ? (req.body.images as Array<{ base64: string; mimeType: string; name?: string }>)
      : [];
    const importedFileContext =
      typeof req.body?.importedFileContext === 'string' ? req.body.importedFileContext.trim() : '';
    const nextEventNumber = Number(req.body?.nextEventNumber || snapshot.matchLogs.length + 1);
    const requestSyncPayload =
      Boolean(req.body?.requestSyncPayload) || images.length > 0 || importedFileContext.length > 0;

    if (!rawMessage && images.length === 0 && !importedFileContext) {
      return res.status(400).json({ error: 'Message, screenshot, or export context is required.' });
    }

    const slashExpanded = rawMessage ? expandSlashCommand(rawMessage) : null;
    const effectivePrompt =
      slashExpanded?.expanded ||
      rawMessage ||
      'Analyze the attached FM27 screenshot(s) or export data against Playbook v2.0 and the loaded save.';
    const commandName = slashExpanded?.command.name;

    const activeTactic =
      aiContext.tactics.find((t) => t.id === aiContext.activeTacticId) ?? null;

    const toolResults = runContextualFmTools({
      prompt: rawMessage || effectivePrompt,
      commandName,
      snapshot,
      managedClubName: aiContext.managedClubName,
      includeManagedClub: aiContext.includeManagedClub,
      activeTactic,
      includeTactic: aiContext.includeTactic,
      recruitmentCases,
      shortlists,
    });

    let createdShortlist: ShortlistRecord | null = null;
    const shortlistTool = toolResults.find((t) => t.toolName === 'fm27_transfer_shortlist');
    if (
      shortlistTool &&
      Array.isArray(shortlistTool.data.targets) &&
      shortlistTool.data.targets.length > 0
    ) {
      const targetIds = (shortlistTool.data.targets as { id: number }[])
        .slice(0, 5)
        .map((t) => t.id);
      if (commandName === '/recruit' || /shortlist/i.test(rawMessage)) {
        const clubLabel =
          aiContext.managedClubName || snapshot.metadata.managedClubName || 'Club';
        createdShortlist = {
          id: `sl-${Date.now()}`,
          name: `AI Targets · ${clubLabel} (${snapshot.metadata.gameDate || 'Save'})`,
          createdBy: 'AI assistant',
          createdAt: snapshot.metadata.gameDate,
          notes: `Generated from query: "${rawMessage.slice(0, 80)}"`,
          playerIds: targetIds,
        };
        shortlists = [createdShortlist, ...shortlists];
      }
    }

    const systemInstruction = [
      'You are the FM27 Chief Tactical Analyst inside the FM27 Command Hub.',
      'Be crisp, tactical, practical, and grounded STRICTLY in the loaded FM27 save data and/or uploaded screenshots/exports.',
      'STRICT ZERO-FABRICATION RULE: Never invent players, clubs, wages, attributes, match xG, possession, or scores not present in the tool outputs or attached files/screenshots. If snapshot status is awaiting_save and no file/screenshot is attached, explicitly state that no save is loaded yet and offer Playbook v2.0 guidance.',
      'Use FM27 Dual-Phase IP/OOP role terminology only (zero legacy FM24 duties like Defend/Support/Attack, zero retired roles like Mezzala/Enganche/Trequartista).',
      PLAYBOOK_V2_SUMMARY_FOR_AI,
      `Save Status: ${snapshot.metadata.status} | Game Date: ${snapshot.metadata.gameDateDmy || snapshot.metadata.gameDate || 'No save loaded'}.`,
      aiContext.includeManagedClub && aiContext.managedClubName
        ? `Managed Club Context: ${aiContext.managedClubName}.`
        : 'Managed Club Context: none active.',
      aiContext.includeTactic && activeTactic
        ? `Active Tactic Context: ${activeTactic.name} (${activeTactic.formation}, ${activeTactic.mentality}, ${activeTactic.tacticalStyle}).`
        : 'Active Tactic Context: none enabled.',
    ].join('\n\n');

    const groundedContextBlock = toolResults
      .map(
        (t) =>
          `### Tool Output: ${t.toolName}\n\`\`\`json\n${JSON.stringify(t.data, null, 2)}\n\`\`\``,
      )
      .join('\n\n');

    const conversationContext = history
      .map((m) => `${m.role === 'user' ? 'Manager' : 'Analyst'}: ${m.content}`)
      .join('\n\n');

    const parts: Array<
      { text: string } | { inlineData: { mimeType: string; data: string } }
    > = [];

    if (conversationContext) {
      parts.push({ text: `Previous conversation:\n${conversationContext}` });
    }
    parts.push({ text: `Loaded FM27 Tool Results:\n${groundedContextBlock}` });
    if (importedFileContext) {
      parts.push({ text: `Imported FM27 Export / Save Context:\n${importedFileContext}` });
    }
    if (createdShortlist) {
      parts.push({
        text: `Note: Shortlist "${createdShortlist.name}" was automatically created with the top targets.`,
      });
    }
    for (const img of images) {
      if (img.base64 && img.mimeType) {
        parts.push({ inlineData: { mimeType: img.mimeType, data: img.base64 } });
      }
    }
    parts.push({
      text: `Manager request (Next Chronicle Event #${nextEventNumber}): ${effectivePrompt}`,
    });

    try {
      const ai = getGeminiClient();

      if (requestSyncPayload) {
        const rawJson = await generateWithRetry(ai, {
          contents: { parts },
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              screenDetected: { type: Type.STRING },
              inGameDate: { type: Type.STRING },
              analysisMarkdown: { type: Type.STRING },
              immediateClicks: { type: Type.ARRAY, items: { type: Type.STRING } },
              targetSheetTable: { type: Type.STRING },
              chronicleTitle: { type: Type.STRING },
              chronicleOutcomeMetric: { type: Type.STRING },
              docEventBulletBlock: { type: Type.STRING },
              sheetRowValues: { type: Type.ARRAY, items: { type: Type.STRING } },
              isMatchResult: { type: Type.BOOLEAN },
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
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    rating: { type: Type.NUMBER },
                    goalsAdded: { type: Type.NUMBER },
                    assistsAdded: { type: Type.NUMBER },
                    minutesAdded: { type: Type.NUMBER },
                    notes: { type: Type.STRING },
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
        });

        if (!rawJson) {
          return res
            .status(502)
            .json({ error: 'Gemini returned an empty response. Please try again.' });
        }

        const syncOutput = JSON.parse(rawJson) as SyncTurnOutput;
        return res.json({
          reply: syncOutput.analysisMarkdown,
          syncOutput,
          commandUsed: commandName,
          toolsUsed: toolResults.map((t) => t.toolName),
          createdShortlist,
        });
      }

      const replyText = await generateWithRetry(ai, {
        contents: { parts },
        systemInstruction,
      });

      if (!replyText) {
        return res
          .status(502)
          .json({ error: 'Gemini returned an empty response. Please try again.' });
      }

      return res.json({
        reply: replyText,
        syncOutput: null,
        commandUsed: commandName,
        toolsUsed: toolResults.map((t) => t.toolName),
        createdShortlist,
      });
    } catch (err: unknown) {
      const rawMessage = err instanceof Error ? err.message : 'Failed to reach Gemini API.';
      console.error('[FM27 Command Hub] Gemini error:', rawMessage);
      let friendly = rawMessage;
      try {
        const parsed = JSON.parse(rawMessage) as {
          error?: { message?: string; status?: string };
        };
        if (parsed.error?.message) {
          friendly = parsed.error.message;
        }
      } catch {
        // Keep rawMessage if not JSON
      }
      const isAuthIssue = /API_KEY|PERMISSION_DENIED|UNAUTHENTICATED|401|403/i.test(rawMessage);
      return res.status(502).json({
        error: isAuthIssue
          ? `AI request failed: ${friendly} Check GEMINI_API_KEY configuration.`
          : `AI assistant is temporarily unavailable: ${friendly}`,
      });
    }
  });

  // === Frontend Serving ===
  if (isProduction) {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*all', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Production build not found. Run npm run build.');
      }
    });
  } else {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`FM27 Command Hub listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start FM27 Command Hub server:', err);
  process.exit(1);
});
