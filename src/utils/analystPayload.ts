/**
 * Analyst payload diagnostics and pre-flight validation.
 *
 * Everything here inspects the payload that is about to be sent to
 * /api/fm27/tactical-chat: section sizes, missing core fields, and the report the
 * Data Quality tab shows. It depends on the context builder, never the reverse.
 */
import {
  AnalystReasoningMode,
  LiveAnalystStateInput,
  MAX_LIVE_ANALYST_CONTEXT_CHARS,
  buildLiveTacticalAnalystContext,
} from './tacticalAnalystContext';
import { isPlaceholderValue } from './squadViewHelpers';
import { loadFm27BinaryDictionary } from './fm27BinaryDictionary';
import { buildClubGovernanceState } from './clubGovernanceAndTactics';

/**
 * Mirrors server/config.ts MAX_CONTEXT_CHARS so client-side diagnostics catch
 * any payload that would be silently truncated by the server security guard.
 */
export const SERVER_MAX_CONTEXT_CHARS = 18_000;

export interface AnalystPayloadSectionMetric {
  header: string;
  chars: number;
  lines: number;
  pctOfLimit: number;
}

export interface AnalystRequiredFieldAudit {
  clubStanding: {
    ok: boolean;
    value: string | null;
    source: 'decoded_fm_save' | 'fallback_state' | 'missing';
    decodedExpected: string | null;
  };
  nextOpponent: {
    ok: boolean;
    value: string | null;
    competition: string | null;
    source: 'decoded_fm_save' | 'fallback_state' | 'missing';
    decodedExpected: string | null;
  };
  squadRoleFits: {
    ok: boolean;
    warRoomSectionPresent: boolean;
    warRoomFilledSlots: number;
    warRoomAvgFitPct: number | null;
    lastTacticSectionPresent: boolean;
    tacticStartersMapped: number;
    decodedIpRoles: number;
    decodedOopRoles: number;
    inferredFallbackRoles: number;
  };
  boardPromises: {
    ok: boolean;
    governanceSectionPresent: boolean;
    managerContractMapped: boolean;
    boardObjectivesCount: number;
    clubPromisesCount: number;
    playerPromiseAuditsCount: number;
    atRiskPromisesCount: number;
    boardObjectivesInPayload: boolean;
    clubPromisesInPayload: boolean;
    playingTimeAuditInPayload: boolean;
  };
}

export interface AnalystRequestDiagnosticsMeta {
  message?: string;
  history?: Array<{ role: 'user' | 'assistant'; text: string }>;
  images?: unknown[];
  importedFileContext?: string;
  reasoningMode?: AnalystReasoningMode | string;
  nextEventNumber?: number;
  currentSaveDate?: string;
  clubName?: string;
  /** Pass pre-built context string to avoid recomputing when already generated */
  liveAppContextOverride?: string;
}

export interface AnalystPayloadDiagnosticsReport {
  timestamp: string;
  clubName: string;
  saveDate: string;
  hasDecodedFmSave: boolean;
  limits: {
    liveContextChars: number;
    liveContextMaxChars: number;
    serverMaxChars: number;
    liveUtilizationPct: number;
    serverUtilizationPct: number;
    withinLiveLimit: boolean;
    withinServerLimit: boolean;
    wasTrimmed: boolean;
    importedFileContextChars: number;
    importedWithinServerLimit: boolean;
    historyTurns: number;
    historyChars: number;
    messageChars: number;
    imageCount: number;
    totalJsonPayloadChars: number;
  };
  sections: AnalystPayloadSectionMetric[];
  requiredData: AnalystRequiredFieldAudit;
  privacyAudit: {
    zeroRawCaPa: boolean;
    flaggedTokens: string[];
  };
  warnings: string[];
  passed: boolean;
  exactPayloadStructure: {
    endpoint: string;
    message: string;
    history: Array<{ role: 'user' | 'assistant'; chars: number }>;
    imageCount: number;
    importedFileContextChars: number;
    liveAppContextChars: number;
    reasoningMode?: string;
    nextEventNumber?: number;
    currentSaveDate?: string;
    clubName?: string;
    liveAppContext: string;
  };
}

export interface AnalystDiagnosticsLogger {
  groupCollapsed?: (...args: unknown[]) => void;
  groupEnd?: () => void;
  table?: (tabularData: unknown) => void;
  log?: (...args: unknown[]) => void;
  warn?: (...args: unknown[]) => void;
  error?: (...args: unknown[]) => void;
}

function parseContextSections(liveAppContext: string): AnalystPayloadSectionMetric[] {
  if (!liveAppContext.trim()) return [];
  const headerRegex = /^===\s*(.+?)\s*===$/gm;
  const matches: Array<{ header: string; index: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = headerRegex.exec(liveAppContext)) !== null) {
    matches.push({ header: m[1].trim(), index: m.index });
  }
  if (matches.length === 0) {
    return [
      {
        header: 'UNSECTIONED',
        chars: liveAppContext.length,
        lines: liveAppContext.split('\n').length,
        pctOfLimit: Number(
          ((liveAppContext.length / MAX_LIVE_ANALYST_CONTEXT_CHARS) * 100).toFixed(1)
        ),
      },
    ];
  }

  return matches.map((entry, idx) => {
    const start = entry.index;
    const end = idx + 1 < matches.length ? matches[idx + 1].index : liveAppContext.length;
    const chunk = liveAppContext.slice(start, end).trim();
    return {
      header: entry.header,
      chars: chunk.length,
      lines: chunk.split('\n').length,
      pctOfLimit: Number(
        ((chunk.length / MAX_LIVE_ANALYST_CONTEXT_CHARS) * 100).toFixed(1)
      ),
    };
  });
}

/**
 * Inspects the exact payload structure sent to the AI Tactical Analyst:
 * - Verifies liveAppContext & importedFileContext stay within client & server char limits
 * - Breaks down every section's character budget
 * - Audits required .fm save mappings (club standing, next opponent, squad role fits, board promises)
 * - Verifies zero raw CA/PA integers leak into the prompt payload
 */
export function diagnoseTacticalAnalystPayload(
  state: LiveAnalystStateInput,
  requestMeta: AnalystRequestDiagnosticsMeta = {}
): AnalystPayloadDiagnosticsReport {
  const liveAppContext =
    requestMeta.liveAppContextOverride ?? buildLiveTacticalAnalystContext(state);
  const decoded = state.hydratedFmSave?.decodedPayload ?? null;
  const hasDecodedFmSave = Boolean(decoded);
  const effectiveClub =
    requestMeta.clubName ||
    decoded?.meta?.clubName ||
    (state.clubName && state.clubName !== '--' ? state.clubName : 'Unknown Club');
  const effectiveDate =
    requestMeta.currentSaveDate ||
    state.saveDate ||
    decoded?.meta?.gameDateDmy ||
    '--';

  const message = requestMeta.message ?? state.userQuery ?? '';
  const history = requestMeta.history ?? [];
  const images = requestMeta.images ?? [];
  const importedFileContext = requestMeta.importedFileContext ?? '';

  const liveContextChars = liveAppContext.length;
  const importedFileContextChars = importedFileContext.length;
  const historyChars = history.reduce((sum, h) => sum + (h.text?.length ?? 0), 0);
  const messageChars = message.length;
  const wasTrimmed = liveAppContext.includes('[Context trimmed]');
  const withinLiveLimit = liveContextChars <= MAX_LIVE_ANALYST_CONTEXT_CHARS;
  const withinServerLimit = liveContextChars <= SERVER_MAX_CONTEXT_CHARS;
  const importedWithinServerLimit = importedFileContextChars <= SERVER_MAX_CONTEXT_CHARS;

  const estimatedRequestJson = JSON.stringify({
    message,
    history,
    imageCount: images.length,
    importedFileContext: importedFileContext || undefined,
    liveAppContext,
    reasoningMode: requestMeta.reasoningMode,
    nextEventNumber: requestMeta.nextEventNumber,
    currentSaveDate: effectiveDate,
    clubName: effectiveClub,
  });

  const sections = parseContextSections(liveAppContext);
  const warnings: string[] = [];

  // 1. Character Limit Checks
  if (!withinLiveLimit) {
    warnings.push(
      `liveAppContext (${liveContextChars} chars) exceeds MAX_LIVE_ANALYST_CONTEXT_CHARS (${MAX_LIVE_ANALYST_CONTEXT_CHARS}).`
    );
  }
  if (!withinServerLimit) {
    warnings.push(
      `liveAppContext (${liveContextChars} chars) exceeds SERVER_MAX_CONTEXT_CHARS (${SERVER_MAX_CONTEXT_CHARS}) and will be truncated by the server guard.`
    );
  }
  if (wasTrimmed) {
    warnings.push(
      `liveAppContext hit the ${MAX_LIVE_ANALYST_CONTEXT_CHARS}-char ceiling and was trimmed — verify tail sections (Squad Profiles / Journey Report) were not cut.`
    );
  }
  if (!importedWithinServerLimit) {
    warnings.push(
      `importedFileContext (${importedFileContextChars} chars) exceeds SERVER_MAX_CONTEXT_CHARS (${SERVER_MAX_CONTEXT_CHARS}) and will be truncated server-side.`
    );
  }

  // 2. Club Standing Audit
  const standingMatch = liveAppContext.match(/^Standing:\s*(.+)$/m);
  const standingValue = standingMatch ? standingMatch[1].trim() : null;
  const decodedStanding = decoded?.leagueStanding ?? null;
  const decodedStandingExpected =
    decodedStanding && typeof decodedStanding.position === 'number'
      ? `#${decodedStanding.position} (${decodedStanding.points} pts, ${decodedStanding.played} GP)`
      : state.hydratedFmSave?.leagueRecordLabel || null;
  const standingMeaningful =
    Boolean(standingValue) &&
    standingValue !== '--' &&
    standingValue !== '-- · --' &&
    !standingValue!.startsWith('0GP (0W-0D-0L, 0Pts) · --');
  const standingMatchesDecoded =
    !decodedStanding ||
    !standingValue ||
    standingValue.includes(`#${decodedStanding.position}`) ||
    standingValue.includes(`${decodedStanding.points}pts`) ||
    standingValue.includes(`${decodedStanding.points}Pts`) ||
    standingValue.includes(`${decodedStanding.points} pts`);
  const standingOk =
    Boolean(standingValue) &&
    (standingMeaningful || !hasDecodedFmSave) &&
    standingMatchesDecoded;
  if (hasDecodedFmSave && !standingOk) {
    warnings.push(
      `Club standing mapping issue: emitted "${standingValue ?? 'MISSING'}" (expected from decoded save: ${decodedStandingExpected ?? 'standing data'}).`
    );
  }

  // 3. Next Opponent Audit
  const nextMatch = liveAppContext.match(/^Next:\s*(.+)$/m);
  const nextValue = nextMatch ? nextMatch[1].trim() : null;
  const decodedNextFixture = decoded?.upcomingFixtures?.[0] ?? null;
  const decodedNextOpponent = decodedNextFixture?.opponent ?? null;
  const nextCompetition = decodedNextFixture?.competition ?? null;
  const nextHasOpponent =
    Boolean(nextValue) &&
    nextValue !== '--' &&
    !/^awaiting/i.test(nextValue!) &&
    !/^tbd$/i.test(nextValue!);
  const nextMatchesDecoded =
    !decodedNextOpponent ||
    (Boolean(nextValue) &&
      nextValue!.toLowerCase().includes(decodedNextOpponent.toLowerCase()));
  const nextOk =
    (!decodedNextOpponent && nextHasOpponent) ||
    (Boolean(decodedNextOpponent) && nextMatchesDecoded) ||
    (!hasDecodedFmSave && state.players.length === 0);
  if (decodedNextOpponent && !nextMatchesDecoded) {
    warnings.push(
      `Next opponent "${decodedNextOpponent}" from decoded .fm save is missing from LIVE CLUB SNAPSHOT ("Next: ${nextValue ?? 'MISSING'}").`
    );
  } else if (hasDecodedFmSave && !nextHasOpponent && decoded?.upcomingFixtures && decoded.upcomingFixtures.length > 0) {
    warnings.push(
      `Next fixture was present in decoded save but not mapped into LIVE CLUB SNAPSHOT.`
    );
  }

  // 4. Squad Role Fits Audit (War Room XI + Last-Match Decoded IP/OOP Blueprint)
  const warRoomHeaderIdx = liveAppContext.search(
    /^=== (?:WAR ROOM COMPUTED .+? STARTING XI|ACTIVE PITCH BUILDER LINEUP OVERRIDE .+?) ===$/m
  );
  const warRoomSectionPresent = warRoomHeaderIdx >= 0;
  let warRoomBody = '';
  if (warRoomHeaderIdx >= 0) {
    const afterHeader = liveAppContext.slice(warRoomHeaderIdx);
    const firstNewline = afterHeader.indexOf('\n');
    if (firstNewline >= 0) {
      const rest = afterHeader.slice(firstNewline + 1);
      const nextSectionIdx = rest.search(/\n\n===/);
      warRoomBody = nextSectionIdx >= 0 ? rest.slice(0, nextSectionIdx) : rest;
    }
  }
  const avgFitMatch = warRoomBody.match(/AvgFit:\s*(\d+)%/);
  const warRoomAvgFitPct = avgFitMatch ? Number(avgFitMatch[1]) : null;
  const warRoomBodyLines = warRoomBody
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const warRoomXiLine =
    warRoomBodyLines.find((l) => !l.startsWith('AvgFit:') && l.includes(':')) ?? '';
  const warRoomSlots = warRoomXiLine
    ? warRoomXiLine.split(' | ').filter((s) => s.trim().length > 0)
    : [];
  const warRoomFilledSlots = warRoomSlots.filter((s) => !/:OPEN\(/.test(s)).length;

  const lastTacticSectionPresent = liveAppContext.includes(
    '=== LAST GAME / ACTIVE SAVE TACTIC BLUEPRINT'
  );
  const startersUsedLine =
    liveAppContext.match(/^Starters Used .+?:\s*(.+)$/m)?.[1] ?? '';
  const starterRoleTokens = Array.from(
    startersUsedLine.matchAll(/\(IP:([^/]+)\/OOP:([^)\s]+(?:\s+[^)\s]+)*?)(?:\s+\d+\.\d+rt|\s+PI\[|\))/g)
  );
  let decodedIpRoles = 0;
  let decodedOopRoles = 0;
  let inferredFallbackRoles = 0;
  for (const tok of starterRoleTokens) {
    const ipRaw = (tok[1] || '').trim();
    const oopRaw = (tok[2] || '').trim();
    if (ipRaw.startsWith('~')) inferredFallbackRoles += 1;
    else if (ipRaw && ipRaw !== 'Std') decodedIpRoles += 1;
    if (oopRaw.startsWith('~')) inferredFallbackRoles += 1;
    else if (oopRaw && oopRaw !== 'Std') decodedOopRoles += 1;
  }

  const expectedTacticInSave = Boolean(
    (decoded?.tactics && decoded.tactics.length > 0) ||
      state.hydratedFmSave?.lastMatchTactic ||
      state.liveLastMatchTactic
  );
  const squadRoleFitsOk =
    state.players.length === 0 ||
    (warRoomSectionPresent &&
      warRoomFilledSlots >= Math.min(11, state.players.length) &&
      (!expectedTacticInSave || lastTacticSectionPresent));
  if (state.players.length > 0 && !warRoomSectionPresent) {
    warnings.push('WAR ROOM COMPUTED DUAL-PHASE XI section is missing from liveAppContext.');
  }
  if (state.players.length >= 11 && warRoomFilledSlots < 11) {
    warnings.push(
      `Only ${warRoomFilledSlots}/11 War Room XI role-fit slots were filled despite ${state.players.length} squad players.`
    );
  }
  if (expectedTacticInSave && !lastTacticSectionPresent) {
    warnings.push(
      'Decoded .fm save contains a club tactic, but LAST GAME / ACTIVE SAVE TACTIC BLUEPRINT is missing from liveAppContext.'
    );
  }

  // 5. Board Promises & Governance Audit
  const liveDict = loadFm27BinaryDictionary();
  const gov =
    state.liveGovernance ??
    (decoded
      ? buildClubGovernanceState(decoded, state.players, liveDict)
      : state.hydratedFmSave?.governance ?? null);
  const governanceSectionPresent = liveAppContext.includes(
    '=== CLUB GOVERNANCE, MANAGER CONTRACT, BOARD TARGETS & PROMISES ==='
  );
  const managerContractMapped =
    /^Manager Contract:\s*(?!.*not exposed)/m.test(liveAppContext);
  const boardObjectivesCount = gov?.boardObjectives.length ?? 0;
  const clubPromisesCount = gov?.clubPromises.length ?? 0;
  const playerPromiseAuditsCount = gov?.playerPromiseAudits.length ?? 0;
  const expectedPromiseAuditsInPayloadCount =
    gov?.playerPromiseAudits.filter(
      (a) =>
        a.status === 'breached' ||
        a.status === 'at_risk' ||
        a.status === 'on_track'
    ).length ?? 0;
  const atRiskPromisesCount =
    gov?.playerPromiseAudits.filter(
      (a) => a.status === 'breached' || a.status === 'at_risk'
    ).length ?? 0;
  const boardObjectivesInPayload = /^Board Objectives:/m.test(liveAppContext);
  const clubPromisesInPayload = /^Active Club\/Manager Promises:/m.test(liveAppContext);
  const playingTimeAuditInPayload = /^Squad Playing-Time Promise Audit/m.test(liveAppContext);

  const boardPromisesOk =
    !gov ||
    (governanceSectionPresent &&
      (boardObjectivesCount === 0 || boardObjectivesInPayload) &&
      (clubPromisesCount === 0 || clubPromisesInPayload) &&
      (expectedPromiseAuditsInPayloadCount === 0 || playingTimeAuditInPayload));

  if (gov && !governanceSectionPresent) {
    warnings.push(
      'CLUB GOVERNANCE, MANAGER CONTRACT, BOARD TARGETS & PROMISES section is missing from liveAppContext.'
    );
  }
  if (boardObjectivesCount > 0 && !boardObjectivesInPayload) {
    warnings.push(
      `${boardObjectivesCount} decoded board objective(s) did not map into liveAppContext.`
    );
  }
  if (clubPromisesCount > 0 && !clubPromisesInPayload) {
    warnings.push(
      `${clubPromisesCount} decoded club/manager promise(s) did not map into liveAppContext.`
    );
  }
  if (expectedPromiseAuditsInPayloadCount > 0 && !playingTimeAuditInPayload) {
    warnings.push(
      `${expectedPromiseAuditsInPayloadCount} squad playing-time promise audit(s) did not map into liveAppContext.`
    );
  }

  // 6. Zero Raw CA/PA Leak Check
  const rawCaPaMatches = Array.from(
    liveAppContext.matchAll(/\b(?:CA|PA)\s*[:=]\s*\d+\b/gi)
  ).map((hit) => hit[0]);
  const zeroRawCaPa = rawCaPaMatches.length === 0;
  if (!zeroRawCaPa) {
    warnings.push(
      `Privacy policy breach: raw numeric CA/PA token(s) detected in liveAppContext: ${rawCaPaMatches.join(', ')}`
    );
  }

  return {
    timestamp: new Date().toISOString(),
    clubName: effectiveClub,
    saveDate: effectiveDate,
    hasDecodedFmSave,
    limits: {
      liveContextChars,
      liveContextMaxChars: MAX_LIVE_ANALYST_CONTEXT_CHARS,
      serverMaxChars: SERVER_MAX_CONTEXT_CHARS,
      liveUtilizationPct: Number(
        ((liveContextChars / MAX_LIVE_ANALYST_CONTEXT_CHARS) * 100).toFixed(1)
      ),
      serverUtilizationPct: Number(
        ((liveContextChars / SERVER_MAX_CONTEXT_CHARS) * 100).toFixed(1)
      ),
      withinLiveLimit,
      withinServerLimit,
      wasTrimmed,
      importedFileContextChars,
      importedWithinServerLimit,
      historyTurns: history.length,
      historyChars,
      messageChars,
      imageCount: images.length,
      totalJsonPayloadChars: estimatedRequestJson.length,
    },
    sections,
    requiredData: {
      clubStanding: {
        ok: standingOk,
        value: standingValue,
        source: decodedStanding
          ? 'decoded_fm_save'
          : standingMeaningful
            ? 'fallback_state'
            : 'missing',
        decodedExpected: decodedStandingExpected,
      },
      nextOpponent: {
        ok: nextOk,
        value: nextValue,
        competition: nextCompetition,
        source: decodedNextOpponent
          ? 'decoded_fm_save'
          : nextHasOpponent
            ? 'fallback_state'
            : 'missing',
        decodedExpected: decodedNextOpponent,
      },
      squadRoleFits: {
        ok: squadRoleFitsOk,
        warRoomSectionPresent,
        warRoomFilledSlots,
        warRoomAvgFitPct,
        lastTacticSectionPresent,
        tacticStartersMapped: starterRoleTokens.length,
        decodedIpRoles,
        decodedOopRoles,
        inferredFallbackRoles,
      },
      boardPromises: {
        ok: boardPromisesOk,
        governanceSectionPresent,
        managerContractMapped,
        boardObjectivesCount,
        clubPromisesCount,
        playerPromiseAuditsCount,
        atRiskPromisesCount,
        boardObjectivesInPayload,
        clubPromisesInPayload,
        playingTimeAuditInPayload,
      },
    },
    privacyAudit: {
      zeroRawCaPa,
      flaggedTokens: rawCaPaMatches,
    },
    warnings,
    passed: warnings.length === 0,
    exactPayloadStructure: {
      endpoint: '/api/fm27/tactical-chat',
      message,
      history: history.map((h) => ({
        role: h.role,
        chars: h.text?.length ?? 0,
      })),
      imageCount: images.length,
      importedFileContextChars,
      liveAppContextChars: liveContextChars,
      reasoningMode: requestMeta.reasoningMode,
      nextEventNumber: requestMeta.nextEventNumber,
      currentSaveDate: effectiveDate,
      clubName: effectiveClub,
      liveAppContext,
    },
  };
}

/**
 * Runs `diagnoseTacticalAnalystPayload` and logs a structured, collapsible
 * payload audit to the developer console (and saves the latest report to
 * `globalThis.__FM27_LAST_ANALYST_DIAGNOSTICS__` for inspection).
 */
export function logTacticalAnalystPayloadDiagnostics(
  state: LiveAnalystStateInput,
  requestMeta: AnalystRequestDiagnosticsMeta = {},
  logger: AnalystDiagnosticsLogger = console
): AnalystPayloadDiagnosticsReport {
  const report = diagnoseTacticalAnalystPayload(state, requestMeta);

  try {
    (globalThis as Record<string, unknown>).__FM27_LAST_ANALYST_DIAGNOSTICS__ =
      report;
  } catch {
    // Non-writable globalThis in strict sandboxes — safe to ignore
  }

  const badge = report.passed ? 'PASS' : `WARN (${report.warnings.length})`;
  const title = `[FM27 Analyst Payload Diagnostics] ${badge} | ${report.clubName} (${report.saveDate}) | ${report.limits.liveContextChars.toLocaleString()}/${report.limits.liveContextMaxChars.toLocaleString()} chars (${report.limits.liveUtilizationPct}%) | Server Cap ${report.limits.serverUtilizationPct}%`;

  logger.groupCollapsed?.(title);

  logger.table?.({
    liveAppContext: {
      chars: report.limits.liveContextChars,
      limit: report.limits.liveContextMaxChars,
      serverCap: report.limits.serverMaxChars,
      status:
        report.limits.withinLiveLimit &&
        report.limits.withinServerLimit &&
        !report.limits.wasTrimmed
          ? 'OK'
          : 'EXCEEDED / TRIMMED',
    },
    importedFileContext: {
      chars: report.limits.importedFileContextChars,
      limit: report.limits.serverMaxChars,
      serverCap: report.limits.serverMaxChars,
      status: report.limits.importedWithinServerLimit ? 'OK' : 'EXCEEDED',
    },
    chatMessageAndHistory: {
      chars: report.limits.messageChars + report.limits.historyChars,
      limit: `${report.limits.historyTurns} turns`,
      serverCap: `${report.limits.imageCount} img(s)`,
      status: `Total JSON ${report.limits.totalJsonPayloadChars.toLocaleString()} chars`,
    },
  });

  logger.table?.(
    report.sections.map((s) => ({
      section: s.header,
      chars: s.chars,
      lines: s.lines,
      pctOfLimit: `${s.pctOfLimit}%`,
    }))
  );

  logger.table?.({
    clubStanding: {
      ok: report.requiredData.clubStanding.ok,
      source: report.requiredData.clubStanding.source,
      mappedValue: report.requiredData.clubStanding.value ?? 'MISSING',
    },
    nextOpponent: {
      ok: report.requiredData.nextOpponent.ok,
      source: report.requiredData.nextOpponent.source,
      mappedValue: report.requiredData.nextOpponent.value ?? 'MISSING',
    },
    squadRoleFits: {
      ok: report.requiredData.squadRoleFits.ok,
      source: report.requiredData.squadRoleFits.lastTacticSectionPresent
        ? 'war_room + decoded_tactic'
        : 'war_room_only',
      mappedValue: `${report.requiredData.squadRoleFits.warRoomFilledSlots}/11 XI (Fit ${report.requiredData.squadRoleFits.warRoomAvgFitPct ?? '--'}/100) · Decoded IP:${report.requiredData.squadRoleFits.decodedIpRoles} OOP:${report.requiredData.squadRoleFits.decodedOopRoles} Inferred:${report.requiredData.squadRoleFits.inferredFallbackRoles}`,
    },
    boardPromises: {
      ok: report.requiredData.boardPromises.ok,
      source: report.requiredData.boardPromises.governanceSectionPresent
        ? 'decoded_governance'
        : 'not_loaded',
      mappedValue: `Obj:${report.requiredData.boardPromises.boardObjectivesCount} Promises:${report.requiredData.boardPromises.clubPromisesCount} PlayingTime:${report.requiredData.boardPromises.playerPromiseAuditsCount} (${report.requiredData.boardPromises.atRiskPromisesCount} at-risk)`,
    },
    zeroRawCaPa: {
      ok: report.privacyAudit.zeroRawCaPa,
      source: 'privacy_guard',
      mappedValue: report.privacyAudit.zeroRawCaPa
        ? 'Clean (0 raw CA/PA)'
        : report.privacyAudit.flaggedTokens.join(', '),
    },
  });

  if (report.warnings.length > 0) {
    for (const w of report.warnings) {
      logger.warn?.(`[FM27 Analyst Diagnostics Warning] ${w}`);
    }
  }

  const preFlight = validatePreFlightAnalystPayload(report);
  if (!preFlight.valid && preFlight.warningMessage) {
    logger.warn?.(`[FM27 Pre-Flight Payload Validator] ${preFlight.warningMessage}`);
  }

  logger.log?.('Exact AI Request Payload Structure:', report.exactPayloadStructure);
  logger.groupEnd?.();

  return report;
}

export type PreFlightRequiredFieldKey =
  | 'clubStanding'
  | 'nextOpponent'
  | 'squadRoleFits'
  | 'boardPromises';

export interface PreFlightAnalystPayload {
  clubStanding?: unknown;
  nextOpponent?: unknown;
  squadRoleFits?: unknown;
  boardPromises?: unknown;
}

export interface PreFlightFieldCheck {
  key: PreFlightRequiredFieldKey;
  label: string;
  present: boolean;
  detail: string;
  /** Informational fields are shown for context and never block the sync status. */
  informational?: boolean;
}

export interface PreFlightPayloadValidationResult {
  valid: boolean;
  checkedAt: string;
  missingFields: PreFlightRequiredFieldKey[];
  missingLabels: string[];
  fields: Record<PreFlightRequiredFieldKey, PreFlightFieldCheck>;
  warningTitle: string | null;
  warningMessage: string | null;
  needsReimport: boolean;
}

const PREFLIGHT_FIELD_LABELS: Record<PreFlightRequiredFieldKey, string> = {
  clubStanding: 'Club Standing',
  nextOpponent: 'Next Opponent',
  squadRoleFits: 'Squad Role Fits',
  boardPromises: 'Board Promises',
};

/**
 * Core fields whose genuine extraction failure requires a save re-import.
 * `boardPromises` is intentionally excluded: FM27 builds that do not expose
 * board/promise data are a normal, valid state, not a failed extraction.
 */
export const CORE_PREFLIGHT_REQUIRED_KEYS: PreFlightRequiredFieldKey[] = [
  'clubStanding',
  'nextOpponent',
  'squadRoleFits',
];

export const INFORMATIONAL_PREFLIGHT_KEYS: PreFlightRequiredFieldKey[] = [
  'boardPromises',
];

const PREFLIGHT_REQUIRED_KEYS: PreFlightRequiredFieldKey[] = [
  ...CORE_PREFLIGHT_REQUIRED_KEYS,
  ...INFORMATIONAL_PREFLIGHT_KEYS,
];

export const BOARD_PROMISES_NONE_LABEL =
  'None active / not exposed in this FM27 build';

function isDiagnosticsReport(
  input: PreFlightAnalystPayload | AnalystPayloadDiagnosticsReport
): input is AnalystPayloadDiagnosticsReport {
  return (
    typeof input === 'object' &&
    input !== null &&
    'requiredData' in input &&
    typeof (input as AnalystPayloadDiagnosticsReport).requiredData === 'object' &&
    (input as AnalystPayloadDiagnosticsReport).requiredData !== null &&
    'exactPayloadStructure' in input
  );
}

/**
 * Pre-flight validation guard. Delegates to the shared placeholder vocabulary so `—`, `-`,
 * `N/A` and the rest of the app's empty markers are all treated as "no data" here too.
 */
function isPlaceholderString(value: string): boolean {
  const trimmed = value.trim();
  if (isPlaceholderValue(trimmed)) return true;
  if (trimmed === '-- · --') return true;
  if (/^(?:missing|awaiting)\b/i.test(trimmed)) return true;
  return false;
}

function isPresentPayloadValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return !isPlaceholderString(value);
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') {
    const rec = value as Record<string, unknown>;
    if ('ok' in rec && typeof rec.ok === 'boolean' && !rec.ok) return false;
    return Object.keys(rec).length > 0;
  }
  return false;
}

/**
 * Extracts the 4 pre-flight required fields (`clubStanding`, `nextOpponent`,
 * `squadRoleFits`, `boardPromises`) from a diagnostics report, returning `null`
 * for any field that failed extraction or is missing from the decoded save payload.
 */
export function extractPreFlightPayloadFields(
  report: AnalystPayloadDiagnosticsReport
): Record<PreFlightRequiredFieldKey, unknown> {
  const { clubStanding, nextOpponent, squadRoleFits, boardPromises } =
    report.requiredData;

  const standingPayload =
    clubStanding.ok &&
    clubStanding.value &&
    clubStanding.source !== 'missing' &&
    !isPlaceholderString(clubStanding.value)
      ? clubStanding.value
      : null;

  const nextOpponentPayload =
    nextOpponent.ok &&
    nextOpponent.value &&
    nextOpponent.source !== 'missing' &&
    !isPlaceholderString(nextOpponent.value)
      ? {
          opponent: nextOpponent.decodedExpected ?? nextOpponent.value,
          label: nextOpponent.value,
          competition: nextOpponent.competition,
          source: nextOpponent.source,
        }
      : null;

  const squadRoleFitsPayload =
    squadRoleFits.ok &&
    squadRoleFits.warRoomSectionPresent &&
    squadRoleFits.warRoomFilledSlots > 0
      ? {
          warRoomFilledSlots: squadRoleFits.warRoomFilledSlots,
          warRoomAvgFitPct: squadRoleFits.warRoomAvgFitPct,
          lastTacticSectionPresent: squadRoleFits.lastTacticSectionPresent,
          tacticStartersMapped: squadRoleFits.tacticStartersMapped,
          decodedIpRoles: squadRoleFits.decodedIpRoles,
          decodedOopRoles: squadRoleFits.decodedOopRoles,
        }
      : null;

  const hasExtractedBoardOrPromiseData =
    boardPromises.boardObjectivesCount > 0 ||
    boardPromises.clubPromisesCount > 0 ||
    boardPromises.playerPromiseAuditsCount > 0;

  const boardPromisesPayload =
    boardPromises.ok &&
    boardPromises.governanceSectionPresent &&
    hasExtractedBoardOrPromiseData
      ? {
          boardObjectivesCount: boardPromises.boardObjectivesCount,
          clubPromisesCount: boardPromises.clubPromisesCount,
          playerPromiseAuditsCount: boardPromises.playerPromiseAuditsCount,
          atRiskPromisesCount: boardPromises.atRiskPromisesCount,
        }
      : null;

  return {
    clubStanding: standingPayload,
    nextOpponent: nextOpponentPayload,
    squadRoleFits: squadRoleFitsPayload,
    boardPromises: boardPromisesPayload,
  };
}

function summarizePresentField(
  key: PreFlightRequiredFieldKey,
  value: unknown
): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return `${value.length} item(s)`;
  if (typeof value === 'object' && value !== null) {
    const rec = value as Record<string, unknown>;
    if (key === 'nextOpponent' && typeof rec.label === 'string') {
      return rec.label;
    }
    if (key === 'squadRoleFits' && typeof rec.warRoomFilledSlots === 'number') {
      const fitStr =
        typeof rec.warRoomAvgFitPct === 'number'
          ? ` · ${rec.warRoomAvgFitPct}% avg fit`
          : '';
      return `${rec.warRoomFilledSlots}/11 XI slots mapped${fitStr}`;
    }
    if (key === 'boardPromises') {
      const obj = Number(rec.boardObjectivesCount ?? 0);
      const prm = Number(rec.clubPromisesCount ?? 0);
      const aud = Number(rec.playerPromiseAuditsCount ?? 0);
      if (obj || prm || aud) {
        return `${obj} targets · ${prm} club promises · ${aud} playing-time audits`;
      }
      return BOARD_PROMISES_NONE_LABEL;
    }
  }
  return 'Extracted';
}

/**
 * Pre-flight payload validator that verifies the presence (non-missing, non-null)
 * of the core fields `clubStanding`, `nextOpponent`, and `squadRoleFits`.
 * `boardPromises` is reported for context only and never triggers a re-import.
 * Accepts either a direct pre-flight payload object or an `AnalystPayloadDiagnosticsReport`.
 * When a core field is missing or null, returns `valid: false`, `needsReimport: true`,
 * and a clear warning message for the UI's Sync status area.
 */
export function validatePreFlightAnalystPayload(
  payload: PreFlightAnalystPayload | AnalystPayloadDiagnosticsReport | null | undefined
): PreFlightPayloadValidationResult {
  const normalized: Record<PreFlightRequiredFieldKey, unknown> =
    !payload
      ? {
          clubStanding: null,
          nextOpponent: null,
          squadRoleFits: null,
          boardPromises: null,
        }
      : isDiagnosticsReport(payload)
        ? extractPreFlightPayloadFields(payload)
        : {
            clubStanding: payload.clubStanding ?? null,
            nextOpponent: payload.nextOpponent ?? null,
            squadRoleFits: payload.squadRoleFits ?? null,
            boardPromises: payload.boardPromises ?? null,
          };

  const fields = {} as Record<PreFlightRequiredFieldKey, PreFlightFieldCheck>;
  const missingFields: PreFlightRequiredFieldKey[] = [];
  const missingLabels: string[] = [];

  for (const key of PREFLIGHT_REQUIRED_KEYS) {
    const value = normalized[key];
    const present = isPresentPayloadValue(value);
    const label = PREFLIGHT_FIELD_LABELS[key];
    const informational = INFORMATIONAL_PREFLIGHT_KEYS.includes(key);
    fields[key] = {
      key,
      label,
      present,
      informational,
      detail: present
        ? summarizePresentField(key, value)
        : informational
          ? BOARD_PROMISES_NONE_LABEL
          : 'Missing or failed extraction',
    };
    if (!present && !informational) {
      missingFields.push(key);
      missingLabels.push(label);
    }
  }

  const valid = missingFields.length === 0;
  const warningTitle = valid
    ? null
    : 'Save Data Failed Extraction — Re-import Required';
  const warningMessage = valid
    ? null
    : `Pre-flight check found missing save data (${missingLabels.join(', ')}). Certain save data failed extraction from your .fm file and needs re-importing for accurate Tactical Analyst advice.`;

  return {
    valid,
    checkedAt: new Date().toISOString(),
    missingFields,
    missingLabels,
    fields,
    warningTitle,
    warningMessage,
    needsReimport: !valid,
  };
}

/**
 * Runs diagnostics and pre-flight validation in a single pass against live app state.
 */
export function runPreFlightAnalystValidation(
  state: LiveAnalystStateInput,
  requestMeta: AnalystRequestDiagnosticsMeta = {},
  options: {
    logToConsole?: boolean;
    logger?: AnalystDiagnosticsLogger;
  } = {}
): {
  diagnostics: AnalystPayloadDiagnosticsReport;
  payload: Record<PreFlightRequiredFieldKey, unknown>;
  validation: PreFlightPayloadValidationResult;
} {
  const diagnostics = options.logToConsole
    ? logTacticalAnalystPayloadDiagnostics(state, requestMeta, options.logger)
    : diagnoseTacticalAnalystPayload(state, requestMeta);
  const payload = extractPreFlightPayloadFields(diagnostics);
  const validation = validatePreFlightAnalystPayload(payload);
  return { diagnostics, payload, validation };
}
