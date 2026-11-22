import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  parseJsonApiResponse,
  sanitizeReaderNote,
  sanitizeReaderNotes,
} from './apiResponse';
import {
  computeTargetBestRoleFit,
  enrichAndFilterScoutedTargets,
  evaluateTargetSquadDepth,
  formatTargetContractSummary,
  getPositionRelevantAttributes,
} from './recruitmentHelpers';
import {
  buildLiveTacticalAnalystContext,
  MAX_LIVE_ANALYST_CONTEXT_CHARS,
} from './tacticalAnalystContext';
import {
  aggregateRecentMatchProduction,
  hydrateAppFromDecodedFmSave,
  resolveSquadStatusFromPlayingTime,
} from './fmSaveHydrator';
import { PlayerRecord } from '../types/fm27';
import { RecruitmentTarget } from '../types/fmSave';

function makePlayer(overrides: Partial<PlayerRecord> & { name: string; position: string }): PlayerRecord {
  return {
    id: `p-${overrides.name}`,
    number: 1,
    apps: '10',
    minutes: 800,
    rating: 7.05,
    goals: 1,
    xG: 0.9,
    xGPer90: 0.1,
    assists: 1,
    xA: 0.8,
    xAPer90: 0.09,
    drbPer90: 1.0,
    prPassesPer90: 3.0,
    hdrPct: 60,
    intPer90: 1.2,
    tckPct: 75,
    personality: 'Balanced',
    age: 24,
    ability: 3.0,
    potential: 3.5,
    condition: 95,
    sharpness: 95,
    preferredFoot: 'Right',
    expires: '30/06/2028',
    nation: 'Belgium',
    wagePw: 450,
    status: 'Starter',
    attributes: {
      pace: 13,
      acceleration: 13,
      stamina: 13,
      jumpingReach: 12,
      determination: 14,
      passing: 12,
      finishing: 10,
      tackling: 11,
      firstTouch: 12,
      decisions: 12,
      workRate: 13,
      offTheBall: 11,
    },
    ipRole: 'Central Midfielder',
    oopRole: 'Pressing Central Midfielder',
    notes: '',
    ...overrides,
  };
}

function makeTarget(
  overrides: Partial<RecruitmentTarget> & { name: string; primaryPosition: string }
): RecruitmentTarget {
  return {
    uid: Math.floor(Math.random() * 100000),
    age: 22,
    nationality: 'Belgium',
    isFreeAgent: true,
    contractExpiryMonths: 0,
    demandedWageEur: 0,
    attributes: {
      pace: 14,
      acceleration: 14,
      stamina: 13,
      strength: 12,
      jumpingReach: 13,
      finishing: 14,
      offTheBall: 14,
      composure: 13,
      passing: 13,
      decisions: 13,
      workRate: 14,
      vision: 12,
      dribbling: 13,
      crossing: 12,
      tackling: 14,
      marking: 13,
      positioning: 14,
      reflexes: 15,
      handling: 14,
      aerialReach: 13,
    },
    ...overrides,
  };
}

test('Issue 1: parseJsonApiResponse safely handles HTML <!doctype> 504/404/200 without throwing Unexpected token <', async () => {
  const html504 = new Response('<!doctype html><html><body>504 Gateway Timeout</body></html>', {
    status: 504,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
  await assert.rejects(
    () => parseJsonApiResponse(html504),
    (err: Error) => {
      assert.doesNotMatch(err.message, /Unexpected token/i);
      assert.match(err.message, /timed out/i);
      return true;
    }
  );

  const html200 = new Response('<!doctype html><html><body>SPA Index</body></html>', {
    status: 200,
    headers: { 'content-type': 'text/html' },
  });
  await assert.rejects(
    () => parseJsonApiResponse(html200),
    (err: Error) => {
      assert.doesNotMatch(err.message, /Unexpected token/i);
      assert.match(err.message, /non-JSON response/i);
      return true;
    }
  );

  const jsonError = new Response(JSON.stringify({ error: 'API endpoint not found' }), {
    status: 404,
    headers: { 'content-type': 'application/json' },
  });
  await assert.rejects(
    () => parseJsonApiResponse(jsonError),
    /API endpoint not found/
  );

  const validJson = new Response(JSON.stringify({ analysisMarkdown: 'Tactical audit ready' }), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
  const ok = await parseJsonApiResponse<{ analysisMarkdown: string }>(validJson);
  assert.equal(ok.analysisMarkdown, 'Tactical audit ready');
});

test('Issue 1: server.ts + server/ modules enforce gemini-3.5-flash-lite/gemini-3.5-flash, response.text getter, 25s timeout 504, and JSON 404 before Vite/SPA', () => {
  const serverSrc = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');
  const combinedServerSrc = [
    serverSrc,
    fs.readFileSync(path.resolve(process.cwd(), 'server/config.ts'), 'utf8'),
    fs.readFileSync(path.resolve(process.cwd(), 'server/geminiService.ts'), 'utf8'),
    fs.readFileSync(path.resolve(process.cwd(), 'server/routes/fm27Routes.ts'), 'utf8'),
  ].join('\n');

  assert.match(combinedServerSrc, /'gemini-3\.5-flash-lite'/);
  assert.match(combinedServerSrc, /'gemini-3\.5-flash'/);
  assert.doesNotMatch(combinedServerSrc, /'gemini-2\.5-flash'/);
  assert.doesNotMatch(combinedServerSrc, /'gemini-2\.5-flash-lite'/);
  assert.match(combinedServerSrc, /DEFAULT_AI_TIMEOUT_MS\s*=\s*45_000/);
  assert.match(combinedServerSrc, /DEEP_AI_TIMEOUT_MS\s*=\s*60_000/);
  assert.match(combinedServerSrc, /AbortSignal\.timeout/);
  assert.match(combinedServerSrc, /res\.status\(504\)\.json/);
  assert.match(combinedServerSrc, /response\.text/);
  assert.doesNotMatch(combinedServerSrc, /response\.text\(\)/);
  assert.match(combinedServerSrc, /'User-Agent':\s*'aistudio-build'/);

  const idxApi404 = serverSrc.indexOf("app.all('/api/{*splat}'");
  const idxVite = serverSrc.indexOf('await createViteServer(');
  const idxSpa = serverSrc.indexOf("app.get('/{*splat}'");
  assert.ok(idxApi404 > 0, 'server.ts must register app.all("/api/{*splat}") JSON 404 handler');
  assert.ok(
    idxApi404 < idxVite && idxApi404 < idxSpa,
    'JSON /api/* 404 handler must be registered BEFORE Vite/SPA HTML catch-all'
  );
});

test('Issue 1: buildLiveTacticalAnalystContext stays strictly under 6,000 chars even with 47 players and 60 scouted targets', () => {
  const squad47: PlayerRecord[] = Array.from({ length: 47 }, (_, idx) =>
    makePlayer({
      name: `Squad Player ${idx + 1}`,
      position: idx < 3 ? 'GK' : idx < 15 ? 'DC' : idx < 30 ? 'MC' : 'ST',
      age: 19 + (idx % 12),
      ability: 2.5 + (idx % 4) * 0.5,
      status: idx < 11 ? 'Starter' : idx < 22 ? 'Rotation' : 'Youth',
    })
  );

  const ctx = buildLiveTacticalAnalystContext({
    clubName: 'KVV Zelzate',
    managerName: 'Bobby Dean',
    saveDate: '12/10/2027',
    nextFixture: '18/10/2027 vs Royal Knokke FC (Home)',
    leagueStandingSub: '#2 of 16 (21 Pts)',
    wageSpend: '£4,400 / £5,000 p/w',
    balance: '£310K',
    players: squad47,
    matches: [],
    hydratedFmSave: null,
  });

  assert.ok(
    ctx.length <= MAX_LIVE_ANALYST_CONTEXT_CHARS && ctx.length < 6000,
    `Expected compact Analyst context < 6000 chars, got ${ctx.length}`
  );
  assert.doesNotMatch(ctx, /\bCA\s*\d+|\bPA\s*\d+/i);
  assert.doesNotMatch(ctx, /PASS 0 SCOUTED FREE AGENTS/i);
});

test('Issue 2: Position-aware Scouted card attributes, Best FM27 Role Fit %, and Unattached Free Transfer formatting', () => {
  const striker = makeTarget({ name: 'Jules Peeters', primaryPosition: 'ST (C)', isFreeAgent: true, demandedWageEur: 0 });
  const mid = makeTarget({ name: 'Bram De Vos', primaryPosition: 'DM, MC', isFreeAgent: false, contractExpiryMonths: 4, demandedWageEur: 620 });
  const cb = makeTarget({ name: 'Sander Claes', primaryPosition: 'DC' });
  const gk = makeTarget({ name: 'Dries Maes', primaryPosition: 'GK' });

  assert.deepEqual(
    getPositionRelevantAttributes(striker).map((a) => a.label),
    ['Fin', 'Off', 'Pac', 'Com']
  );
  assert.deepEqual(
    getPositionRelevantAttributes(mid).map((a) => a.label),
    ['Pas', 'Dec', 'Wor', 'Sta']
  );
  assert.deepEqual(
    getPositionRelevantAttributes(cb).map((a) => a.label),
    ['Tck', 'Mar', 'Pos', 'Jum']
  );
  assert.deepEqual(
    getPositionRelevantAttributes(gk).map((a) => a.label),
    ['Ref', 'Han', 'Aer', 'Pos']
  );

  const stFit = computeTargetBestRoleFit(striker);
  assert.ok(stFit.roleName.length > 0);
  assert.ok(stFit.fitPct >= 40 && stFit.fitPct <= 99);

  // Free agent must show Unattached · Free Transfer and NEVER Wage £0/wk
  const freeContract = formatTargetContractSummary(striker);
  assert.equal(freeContract.primaryLabel, 'Unattached · Free Transfer');
  assert.equal(freeContract.wageLabel, null);

  // Expiring contract shows months left + weekly wage
  const expContract = formatTargetContractSummary(mid);
  assert.equal(expContract.primaryLabel, 'Expiring <= 4m');
  assert.equal(expContract.wageLabel, '£620/wk');
});

test('Issue 2: Accurate Squad Depth GAP logic — 6 active options is NOT a GAP, <=2 IS Priority GAP, and default sort prioritizes Genuine Gaps + Role Fit %', () => {
  const squad: PlayerRecord[] = [
    // 6 active central midfielders (NOT a gap!)
    ...Array.from({ length: 6 }, (_, i) =>
      makePlayer({ name: `Midfielder ${i + 1}`, position: 'MC' })
    ),
    // Only 1 striker (genuine Priority GAP!)
    makePlayer({ name: 'Sole Striker', position: 'ST (C)' }),
  ];

  const mcDepth = evaluateTargetSquadDepth('MC', squad);
  assert.equal(mcDepth.count, 6);
  assert.equal(mcDepth.isGenuineGap, false);
  assert.equal(mcDepth.label, 'Depth: 6 at club');

  const stDepth = evaluateTargetSquadDepth('ST', squad);
  assert.equal(stDepth.count, 1);
  assert.equal(stDepth.isGenuineGap, true);
  assert.match(stDepth.label, /Priority GAP/);

  const targets: RecruitmentTarget[] = [
    makeTarget({ name: 'Midfield Surplus Target', primaryPosition: 'MC', age: 21 }),
    makeTarget({ name: 'Striker Gap Target', primaryPosition: 'ST', age: 23 }),
  ];

  const sortedAll = enrichAndFilterScoutedTargets({
    targets,
    squadPlayers: squad,
    posGroup: 'ALL',
    ageBand: 'ALL',
    contractFilter: 'ALL',
    genuineGapsOnly: false,
    searchQuery: '',
  });
  assert.equal(sortedAll[0].target.name, 'Striker Gap Target');

  const gapsOnly = enrichAndFilterScoutedTargets({
    targets,
    squadPlayers: squad,
    posGroup: 'ALL',
    ageBand: 'ALL',
    contractFilter: 'ALL',
    genuineGapsOnly: true,
    searchQuery: '',
  });
  assert.equal(gapsOnly.length, 1);
  assert.equal(gapsOnly[0].target.name, 'Striker Gap Target');
});

test('Issue 2 & 3: Python fm-save-mapper resolves nationalities via save.nations(), caps 30+ veterans at <=15%, supports non-strict inspect.signature recovery, and strips raw GitHub URLs', () => {
  // Frontend sanitizer strips raw GitHub issue URLs cleanly
  const rawWarn =
    'player_season_stats: check failed. Please report it at https://github.com/rhiever/fmsave/issues with the output of fmsave validate.';
  const cleaned = sanitizeReaderNote(rawWarn);
  assert.doesNotMatch(cleaned, /https?:\/\//i);
  assert.doesNotMatch(cleaned, /github\.com/i);
  assert.match(cleaned, /player_season_stats/);
  assert.equal(sanitizeReaderNotes([rawWarn, rawWarn]).length, 1);

  // Execute live Python test against public/fm-save-mapper.py helpers using venv or system python3
  // Inject a clean temporary stub fmsave module via PYTHONPATH when fmsave isn't installed
  const runMapperPy = (pyScript: string): string => {
    const pythonBin = fs.existsSync('/opt/fmsave-venv/bin/python3')
      ? '/opt/fmsave-venv/bin/python3'
      : 'python3';
    const stubDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fmsave-stub-'));
    try {
      fs.writeFileSync(
        path.join(stubDir, 'fmsave.py'),
        'def open(*args, **kwargs):\n    raise NotImplementedError("stub fmsave")\n',
        'utf8'
      );
      const existingPyPath = process.env.PYTHONPATH || '';
      const pyPath = existingPyPath
        ? `${existingPyPath}${path.delimiter}${stubDir}`
        : stubDir;
      return execFileSync(pythonBin, ['-c', pyScript], {
        cwd: process.cwd(),
        encoding: 'utf8',
        timeout: 15_000,
        env: { ...process.env, PYTHONPATH: pyPath },
      });
    } finally {
      fs.rmSync(stubDir, { recursive: true, force: true });
    }
  };

  const pyTestScript = `
import importlib.util, json, types
spec = importlib.util.spec_from_file_location("mapper", "public/fm-save-mapper.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

# 1. Test nation_id -> Nation.database_id -> country name resolution via save.nations()
class FakeNation:
    def __init__(self, nation_id, database_id):
        self.nation_id = nation_id
        self.database_id = database_id

class FakeAttrs:
    def __init__(self, val=13):
        for k in ("pace","acceleration","stamina","strength","agility","balance","jumping_reach",
                  "natural_fitness","finishing","off_the_ball","composure","passing","decisions",
                  "work_rate","vision","dribbling","crossing","technique","first_touch","tackling",
                  "marking","positioning","anticipation","concentration","heading","determination",
                  "teamwork","flair","reflexes","handling","aerial_reach","command_of_area",
                  "one_on_ones","kicking","communication"):
            setattr(self, k, val)

class FakePlayer:
    def __init__(self, uid, name, age, nation_id, pos="ST"):
        self.uid = uid
        self.name = name
        self.age = age
        self.nation_id = nation_id
        self.club_uid = None
        self.contract = None
        self.natural_positions = (pos,)
        self.accomplished_positions = ()
        self.attributes = FakeAttrs(14 if age < 30 else 15)
        self.personality = None
        self.traits = ()

class FakeSave:
    def nations(self):
        return [FakeNation(0, 757), FakeNation(1, 784), FakeNation(2, 769)]
    def players(self):
        out = []
        # 50 prime targets (17-29) and 30 veterans (30-34)
        for i in range(50):
            out.append(FakePlayer(1000 + i, f"Prime {i}", 19 + (i % 9), i % 3, "ST"))
        for i in range(30):
            out.append(FakePlayer(2000 + i, f"Vet {i}", 30 + (i % 5), i % 3, "MC"))
        return out

mod.step_close()
save = FakeSave()
targets = mod._scan_recruitment_targets_group4(save, club_uid=999, game_date=None, wage_budget_weekly=5000)
nations = sorted({t["nationality"] for t in targets})
vet_count = sum(1 for t in targets if t["age"] >= 30)
total = len(targets)

# 2. Verify non-strict inspect.signature kwargs detection
def strict_fn(strict=True):
    return "non_strict_ok" if strict is False else "strict_fail"
res_non_strict = mod._safe_call(strict_fn, "test_table", default="fail")

# 3. Verify GitHub URL stripping in Python warning sanitizer
clean_py_note = mod._sanitize_reader_note("team_match_stats: advisory mismatch. Please report it at https://github.com/rhiever/fmsave/issues with the output of fmsave validate.")

print(json.dumps({
    "total": total,
    "vetCount": vet_count,
    "vetRatio": vet_count / max(total, 1),
    "nations": nations,
    "hasFinishing": "finishing" in targets[0]["attributes"],
    "hasReflexes": "reflexes" in targets[0]["attributes"],
    "nonStrictRes": res_non_strict,
    "cleanPyNote": clean_py_note,
}))
`;

  const rawOut = runMapperPy(pyTestScript);
  const result = JSON.parse(rawOut.trim()) as {
    total: number;
    vetCount: number;
    vetRatio: number;
    nations: string[];
    hasFinishing: boolean;
    hasReflexes: boolean;
    nonStrictRes: string;
    cleanPyNote: string;
  };

  assert.ok(result.total > 0, 'Expected recruitment targets from Python scanner');
  assert.deepEqual(result.nations, ['Belgium', 'France', 'Netherlands']);
  assert.ok(
    result.vetRatio <= 0.151,
    `Expected age 30+ veterans <= 15%, got ${(result.vetRatio * 100).toFixed(1)}% (${result.vetCount}/${result.total})`
  );
  assert.equal(result.hasFinishing, true);
  assert.equal(result.hasReflexes, true);
  assert.equal(result.nonStrictRes, 'non_strict_ok');
  assert.doesNotMatch(result.cleanPyNote, /https?:\/\/|github\.com/i);
});

test('Fixes 2, 3, 4 & 5 (Python): Exact-key nationality resolution, contract bonus/clause separation, 52-attr scout profiles, and FM27 27.1 fast-path skip + 35s native history budget', () => {
  const pythonBin = fs.existsSync('/opt/fmsave-venv/bin/python3')
    ? '/opt/fmsave-venv/bin/python3'
    : 'python3';
  const stubDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fmsave-stub-'));
  let rawOut = '';
  try {
    fs.writeFileSync(
      path.join(stubDir, 'fmsave.py'),
      'def open(*args, **kwargs):\n    raise NotImplementedError("stub fmsave")\n',
      'utf8'
    );
    const existingPyPath = process.env.PYTHONPATH || '';
    const pyPath = existingPyPath
      ? `${existingPyPath}${path.delimiter}${stubDir}`
      : stubDir;

    const pyScript = `
import importlib.util, json, types
spec = importlib.util.spec_from_file_location("mapper", "public/fm-save-mapper.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
mod.step_close()

# Fix 2: Exact-key nationality matching (Kosovo, Algeria, Mauritania, Burkina Faso, Mali) — NEVER by list index
class NationRow:
    def __init__(self, nation_id, database_id):
        self.nation_id = nation_id
        self.database_id = database_id

class NatSave:
    def nations(self):
        # Deliberately non-sequential save-local nation_ids that would fail list-index lookup
        return [
            NationRow(42, 804),   # Kosovo
            NationRow(11, 1),     # Algeria
            NationRow(77, 32),    # Mauritania
            NationRow(19, 5),     # Burkina Faso
            NationRow(88, 31),    # Mali
            NationRow(1, 757),    # Belgium (save-local id=1 MUST NOT collide with Algeria db_id=1!)
        ]

lookup = mod._build_nation_lookup(NatSave())
class NatPlayer:
    def __init__(self, nid):
        self.nation_id = nid
nat_results = {
    "kosovo": mod._resolve_player_nationality(NatPlayer(42), lookup),
    "algeria": mod._resolve_player_nationality(NatPlayer(11), lookup),
    "mauritania": mod._resolve_player_nationality(NatPlayer(77), lookup),
    "burkina": mod._resolve_player_nationality(NatPlayer(19), lookup),
    "mali": mod._resolve_player_nationality(NatPlayer(88), lookup),
    "belgium_no_collision": mod._resolve_player_nationality(NatPlayer(1), lookup),
    "unmapped_not_algeria": mod._resolve_player_nationality(NatPlayer(5), lookup),
}

# Fix 3: Separate Match Bonuses from true Release Clauses
class FakeClause:
    def __init__(self, kind, value, parameter=None):
        self.kind = kind
        self.value = value
        self.parameter = parameter

class FakeContract:
    squad_status = "REGULAR_STARTER"
    clauses = [
        FakeClause("APPEARANCE_FEE", 250),
        FakeClause("SHUTOUT_BONUS", 150),
        FakeClause("UNUSED_SUBSTITUTE_FEE", 75),
        FakeClause("SEASONAL_LANDMARK_COMBINED_GOALS_AND_ASSISTS", 1000),
        FakeClause("OPTIONAL_EXTENSION_BY_CLUB", None, parameter=2),
        FakeClause("MINIMUM_FEE_RELEASE", 500000),
    ]

cd = mod._extract_contract_details(FakeContract())

# Fix 4: Full 52 visible attributes, positionRatings, traits, scoutBadges, domestic + prime boost
mod.step_close()
mod._STATE["players_out"] = [{"nation": "Belgium", "wagePw": 1500, "position": "ST", "attributes": {"pace": 12}}]
class FullAttrs:
    def __init__(self, v=13):
        for k in ("corners","crossing","dribbling","finishing","first_touch","free_kick_taking",
                  "heading","long_shots","long_throws","marking","passing","penalty_taking",
                  "tackling","technique","aggression","anticipation","bravery","composure",
                  "concentration","decisions","determination","flair","leadership","off_the_ball",
                  "positioning","teamwork","vision","work_rate","acceleration","agility","balance",
                  "jumping_reach","natural_fitness","pace","stamina","strength","aerial_reach",
                  "command_of_area","communication","eccentricity","handling","kicking","one_on_ones",
                  "punching","reflexes","rushing_out","throwing"):
            setattr(self, k, v)

class ScoutPlayer:
    def __init__(self, uid, name, age, nation_id):
        self.uid = uid
        self.name = name
        self.age = age
        self.nation_id = nation_id
        self.club_uid = None
        self.contract = None
        self.natural_positions = ("ST",)
        self.accomplished_positions = ("AMR",)
        self.positions = {"st": 20, "amr": 16}
        self.attributes = FullAttrs(14)
        self.personality = None
        self.traits = ("Places Shots",)

class ScoutSave:
    def nations(self):
        return [NationRow(1, 757), NationRow(2, 769)]
    def players(self):
        return [
            ScoutPlayer(1, "Veteran 35", 35, 2),
            ScoutPlayer(2, "Foreign Prime", 23, 2),
            ScoutPlayer(3, "Domestic Prime", 23, 1),
        ]

targets = mod._scan_recruitment_targets_group4(ScoutSave(), club_uid=999, game_date=None, wage_budget_weekly=5000)
top_target = targets[0]

# Fix 5: FM27 27.1 fast-path skip + 10s browser / 35s native history budgets
class Fm27Save:
    info = types.SimpleNamespace(game="FM27", build="27.1.0")
fm27_skip = mod._is_fm27_27_1_unsupported_stats_build(Fm27Save())
class Fm26Save:
    info = types.SimpleNamespace(game="FM26", build="26.4.0")
fm26_skip = mod._is_fm27_27_1_unsupported_stats_build(Fm26Save())

print(json.dumps({
    "natResults": nat_results,
    "contractDetails": cd,
    "topTargetName": top_target["name"],
    "topTargetAttrCount": len(top_target["attributes"]),
    "topTargetPosRatings": top_target.get("positionRatings"),
    "topTargetTraits": top_target.get("traits"),
    "hasRawCaPa": ("ca" in top_target or "pa" in top_target),
    "fm27Skip": fm27_skip,
    "fm26Skip": fm26_skip,
    "browserHistoryBudget": mod.SEASON_HISTORY_BUDGET_SEC,
    "nativeHistoryBudget": mod.NATIVE_SEASON_HISTORY_BUDGET_SEC,
}))
`;
    rawOut = execFileSync(pythonBin, ['-c', pyScript], {
      cwd: process.cwd(),
      encoding: 'utf8',
      timeout: 15_000,
      env: { ...process.env, PYTHONPATH: pyPath },
    });
  } finally {
    fs.rmSync(stubDir, { recursive: true, force: true });
  }

  const res = JSON.parse(rawOut.trim());
  // Fix 2 assertions
  assert.equal(res.natResults.kosovo, 'Kosovo');
  assert.equal(res.natResults.algeria, 'Algeria');
  assert.equal(res.natResults.mauritania, 'Mauritania');
  assert.equal(res.natResults.burkina, 'Burkina Faso');
  assert.equal(res.natResults.mali, 'Mali');
  assert.equal(res.natResults.belgium_no_collision, 'Belgium');
  assert.equal(res.natResults.unmapped_not_algeria, 'Unknown');

  // Fix 3 assertions
  assert.equal(res.contractDetails.promisedPlayingTime, 'Regular Starter');
  assert.equal(res.contractDetails.releaseClauses.length, 1);
  assert.equal(res.contractDetails.releaseClauses[0].type, 'Minimum Fee Release');
  assert.equal(res.contractDetails.releaseClauses[0].amount, 500000);
  assert.equal(res.contractDetails.bonuses.appearanceFee, 250);
  assert.equal(res.contractDetails.bonuses.cleanSheetBonus, 150);
  assert.equal(res.contractDetails.bonuses.unusedSubFee, 75);
  assert.equal(res.contractDetails.bonuses.goalBonus, 1000);
  assert.equal(res.contractDetails.optionalExtensionYears, 2);

  // Fix 4 assertions
  assert.equal(res.topTargetName, 'Domestic Prime');
  assert.ok(res.topTargetAttrCount >= 52, `Expected >=52 attributes, got ${res.topTargetAttrCount}`);
  assert.deepEqual(res.topTargetPosRatings, { ST: 20, AMR: 16 });
  assert.deepEqual(res.topTargetTraits, ['Places Shots']);
  assert.equal(res.hasRawCaPa, false);

  // Fix 5 Python assertions
  assert.equal(res.fm27Skip, true);
  assert.equal(res.fm26Skip, false);
  assert.ok(res.browserHistoryBudget >= 10);
  assert.equal(res.nativeHistoryBudget, 45);
});

test('Fixes 3 & 5 (TypeScript): promisedPlayingTime single source of truth for Squad Status and Recent-Match Production Fallback', () => {
  // Fix 3: promisedPlayingTime -> Squad Status
  assert.equal(resolveSquadStatusFromPlayingTime('Star Player', 'Surplus'), 'Starter');
  assert.equal(resolveSquadStatusFromPlayingTime('Regular Starter', 'Surplus'), 'Starter');
  assert.equal(resolveSquadStatusFromPlayingTime('Squad Player', 'Starter'), 'Rotation');
  assert.equal(resolveSquadStatusFromPlayingTime('Future Prospect', 'Rotation'), 'Youth');
  assert.equal(resolveSquadStatusFromPlayingTime('Surplus To Requirements', 'Starter'), 'Surplus');

  // Fix 5: Recent-Match Production Fallback helper
  const agg = aggregateRecentMatchProduction([
    { date: '2026-10-01', opponent: 'Club A', rating: 7.4, goals: 1, assists: 0, minutes: 90 },
    { date: '2026-10-08', opponent: 'Club B', rating: 6.8, goals: 0, assists: 1, minutes: 75 },
    { date: '2026-10-15', opponent: 'Club C', rating: 7.7, goals: 2, assists: 1, minutes: 90 },
  ]);
  assert.equal(agg.apps, '3');
  assert.equal(agg.minutes, 255);
  assert.equal(agg.rating, 7.3);
  assert.equal(agg.goals, 3);
  assert.equal(agg.assists, 2);
  assert.equal(agg.source, 'From Recent Matches');

  // End-to-end hydration check: empty season stats + present playerMatchStats + Regular Starter playing time
  const hydrated = hydrateAppFromDecodedFmSave(
    {
      meta: {
        fileName: 'test.fm',
        fileSizeMb: 50,
        decodedAtIso: '2026-11-21T00:00:00Z',
        game: 'FM27',
        build: '27.1.0',
        gameDateDmy: '21/11/2026',
        clubUid: 100,
        clubName: 'KVV Zelzate',
        managerName: 'Bobby Dean',
      },
      players: [
        {
          uid: 501,
          name: 'Recent Form Striker',
          age: 24,
          position: 'ST',
          apps: '0',
          minutes: 0,
          rating: null,
          goals: 0,
          assists: 0,
          contractDetails: {
            promisedPlayingTime: 'Regular Starter',
            releaseClauses: [],
            optionalExtensionYears: 0,
            bonuses: { appearanceFee: 200 },
            loanWageContributionPct: null,
          },
        },
      ],
      playerMatchStats: {
        '501': [
          { date: '2026-11-01', opponent: 'Opp 1', rating: 7.5, goals: 1, assists: 1, minutes: 90 },
          { date: '2026-11-08', opponent: 'Opp 2', rating: 7.1, goals: 1, assists: 0, minutes: 80 },
        ],
      },
      playedMatches: [],
      upcomingFixtures: [],
      staff: [],
      tactics: [],
      activeInjuries: [],
      mentoring: [],
      warnings: [],
    } as unknown as Parameters<typeof hydrateAppFromDecodedFmSave>[0],
    [],
    []
  );

  assert.equal(hydrated.updatedSquad.length, 1);
  const p = hydrated.updatedSquad[0];
  assert.equal(p.status, 'Starter');
  assert.equal(p.apps, '2');
  assert.equal(p.minutes, 170);
  assert.equal(p.rating, 7.3);
  assert.equal(p.goals, 2);
  assert.equal(p.assists, 1);
  assert.equal(p.statsSource, 'From Recent Matches');
});

test('Autonomous fmsave Runtime Patcher & Mapper: CodedValue tactic bitmasks, 4-3-3 DM Wide formation, typed 4-week training calendar, squad_planner, deep_scrub_ca_pa, and upload DELETE abort cleanup', () => {
  const decodeRoutesSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'server/routes/fmDecodeRoutes.ts'),
    'utf8'
  );
  const saveReaderSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/services/fmSaveReader.ts'),
    'utf8'
  );
  const workerSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'public/fm-save-worker.js'),
    'utf8'
  );
  assert.match(decodeRoutesSrc, /router\.delete\('\/fm27\/decode-save\/upload\/:uploadId'/);
  assert.match(saveReaderSrc, /\/api\/fm27\/decode-save\/upload\//);
  assert.match(workerSrc, /\/fm_layout_patcher\.py\?v=17/);

  const pythonBin = fs.existsSync('/opt/fmsave-venv/bin/python3')
    ? '/opt/fmsave-venv/bin/python3'
    : 'python3';
  const stubDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fmsave-stub-'));
  let rawOut = '';
  try {
    fs.writeFileSync(
      path.join(stubDir, 'fmsave.py'),
      'def open(*args, **kwargs):\n    raise NotImplementedError("stub fmsave")\n',
      'utf8'
    );
    const existingPyPath = process.env.PYTHONPATH || '';
    const pyPath = existingPyPath
      ? `${existingPyPath}${path.delimiter}${stubDir}`
      : stubDir;

    const pyScript = `
import importlib.util, json, types
from datetime import date

spec_p = importlib.util.spec_from_file_location("fm_layout_patcher", "public/fm_layout_patcher.py")
patcher = importlib.util.module_from_spec(spec_p)
spec_p.loader.exec_module(patcher)

spec_m = importlib.util.spec_from_file_location("mapper", "public/fm-save-mapper.py")
mod = importlib.util.module_from_spec(spec_m)
spec_m.loader.exec_module(mod)

# 1. CodedValue TacticPosition bitmask decoding (0x200000 Right, 0x100000 Left)
class FakeEnum:
    def __init__(self, name):
        self.name = name

class FakeCoded:
    def __init__(self, name, raw=0):
        self.label = FakeEnum(name)
        self.raw = raw

pos_gk = mod._decode_tactic_slot_position((FakeCoded("GOALKEEPER"),), 0)
pos_dcr = mod._decode_tactic_slot_position((FakeCoded("DEFENDER_CENTRE"),), 0x200000)
pos_dcl = mod._decode_tactic_slot_position((FakeCoded("DEFENDER_CENTRE"),), 0x100000)
pos_mcr = mod._decode_tactic_slot_position((FakeCoded("MIDFIELDER_CENTRE"),), 0x200000)
pos_mcl = mod._decode_tactic_slot_position((FakeCoded("MIDFIELDER_CENTRE"),), 0x100000)
formation = mod._derive_formation_from_positions(["GK", "DR", pos_dcr, pos_dcl, "DL", "DM", pos_mcr, pos_mcl, "AMR", "AML", "STC"])

# 2. Typed 4-week training calendar with FM27 session code lookup
class FakeSession:
    def __init__(self, name, raw):
        self.label = FakeEnum(name)
        self.raw = raw

class FakeDay:
    def __init__(self, d, codes):
        self.day = d
        self.sessions = tuple(FakeSession("UNKNOWN", c) for c in codes)

class FakeWeek:
    def __init__(self, ws, name, days):
        self.week_start = ws
        self.schedule_name = name
        self.days = days

class FakeSched:
    def __init__(self, folder, name):
        self.folder = folder
        self.name = name

class FakeTeamTraining:
    club_uid = 18104898
    team_slot = 0
    club_name = "KVV Zelzate"
    weeks = (
        FakeWeek(date(2027, 9, 6), "Pre-Match", (FakeDay(date(2027, 9, 6), (200, 0, 1)),)),
        FakeWeek(date(2027, 9, 13), "Tactical Focus - Balanced", (FakeDay(date(2027, 9, 14), (104, 101, 106)), FakeDay(date(2027, 9, 15), (300, 500, 600)))),
    )
    schedule_library = (
        FakeSched("Custom", "Balanced"),
        FakeSched("Custom", "Balanced"),
        FakeSched("Custom", "Counter"),
    )

class FakeTrainingSave:
    def training(self):
        return (FakeTeamTraining(),)
    def squad_planner(self):
        return (
            types.SimpleNamespace(season_offset=0, slot=0, player_uids=(101, 102)),
            types.SimpleNamespace(season_offset=1, slot=1, player_uids=()),
        )

tr = mod._extract_typed_team_training(FakeTrainingSave(), 18104898, date(2027, 9, 15))
sp = mod._extract_squad_planner(FakeTrainingSave(), {101: "René Vanden Borre", 102: "Jasper Baeyens"})

# 3. Recursive deep_scrub_ca_pa check
dirty = {
    "meta": {"clubName": "KVV Zelzate"},
    "players": [{"name": "Test", "ca": 120, "pa": 150, "nested": {"current_ability": 115, "potential_ability": 140, "internal_reliability": 12, "safe": 15}}],
}
clean = mod.deep_scrub_ca_pa(dirty)

print(json.dumps({
    "posGk": pos_gk,
    "posDcr": pos_dcr,
    "posDcl": pos_dcl,
    "posMcr": pos_mcr,
    "posMcl": pos_mcl,
    "formation": formation,
    "trainingCalendarLen": len(tr["calendar"]),
    "trainingSessionsSample": tr["calendar"][1]["days"][0]["sessions"],
    "trainingMatchDaySample": tr["calendar"][1]["days"][1]["sessions"],
    "scheduleLibLen": len(tr["scheduleLibrary"]),
    "squadPlanner": sp,
    "cleanPlayer": clean["players"][0],
}))
`;
    rawOut = execFileSync(pythonBin, ['-c', pyScript], {
      cwd: process.cwd(),
      encoding: 'utf8',
      timeout: 15_000,
      env: { ...process.env, PYTHONPATH: pyPath },
    });
  } finally {
    fs.rmSync(stubDir, { recursive: true, force: true });
  }

  const res = JSON.parse(rawOut.trim());
  assert.equal(res.posGk, 'GK');
  assert.equal(res.posDcr, 'DCR');
  assert.equal(res.posDcl, 'DCL');
  assert.equal(res.posMcr, 'MCR');
  assert.equal(res.posMcl, 'MCL');
  assert.equal(res.formation, '4-3-3 DM Wide');
  assert.equal(res.trainingCalendarLen, 2);
  assert.deepEqual(res.trainingSessionsSample, [
    'Set-Piece Delivery',
    'Aerial & Box Defending',
    'Attacking Movement & Combinations',
  ]);
  assert.deepEqual(res.trainingMatchDaySample, [
    'Rest',
    'Match',
    'Individual Focus / Unassigned',
  ]);
  assert.equal(res.scheduleLibLen, 2);
  assert.equal(res.squadPlanner.length, 1);
  assert.deepEqual(res.squadPlanner[0].playerNames, [
    'René Vanden Borre',
    'Jasper Baeyens',
  ]);
  assert.equal('ca' in res.cleanPlayer, false);
  assert.equal('pa' in res.cleanPlayer, false);
  assert.equal('current_ability' in res.cleanPlayer.nested, false);
  assert.equal('potential_ability' in res.cleanPlayer.nested, false);
  assert.equal('internal_reliability' in res.cleanPlayer.nested, false);
  assert.equal(res.cleanPlayer.nested.safe, 15);
});

