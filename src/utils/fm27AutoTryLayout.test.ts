import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';

test('auto-try layout only retries untested builds with a missing critical section', () => {
  const pyScript = `
import importlib.util, json, sys, types

stub = types.ModuleType("fmsave")
stub.__version__ = "0.14.4"
sys.modules["fmsave"] = stub

spec = importlib.util.spec_from_file_location("fm_save_mapper", "public/fm-save-mapper.py")
mapper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mapper)

bounded_fallback = {
    "isUntestedBuild": True,
    "layoutBase": "27.0",
    "sections": [
        {"id": "players", "status": "clean"},
        {"id": "squad_planner", "status": "fallback"},
        {"id": "managed_club", "status": "fallback"},
        {"id": "scouting_budget", "status": "fallback"},
        {"id": "league_table", "status": "unavailable"},
    ],
}
critical_gap = {
    "isUntestedBuild": True,
    "layoutBase": "27.1",
    "sections": [
        {"id": "players", "status": "unavailable"},
        {"id": "staff", "status": "clean"},
    ],
}
many_fallbacks = {
    "isUntestedBuild": True,
    "layoutBase": "27.1",
    "sections": [
        {"id": "players", "status": "clean"},
        {"id": "staff", "status": "fallback"},
        {"id": "finances", "status": "fallback"},
        {"id": "tactics", "status": "fallback"},
        {"id": "seasons", "status": "fallback"},
    ],
}
clean = {
    "isUntestedBuild": True,
    "layoutBase": "27.0",
    "sections": [
        {"id": "players", "status": "clean"},
        {"id": "tactics_set_piece", "status": "clean"},
    ],
}
known = {**bounded_fallback, "isUntestedBuild": False}

print(json.dumps({
    "boundedFallback": mapper.should_try_alternate_layout(bounded_fallback),
    "criticalGap": mapper.should_try_alternate_layout(critical_gap),
    "manyFallbacks": mapper.should_try_alternate_layout(many_fallbacks),
    "untestedClean": mapper.should_try_alternate_layout(clean),
    "knownFallback": mapper.should_try_alternate_layout(known),
    "betterSecond": mapper.choose_better_layout_compat(critical_gap, clean),
    "notBetter": mapper.choose_better_layout_compat(clean, critical_gap),
    "tie": mapper.choose_better_layout_compat(bounded_fallback, bounded_fallback),
    "penalty": mapper._layout_compat_penalty(bounded_fallback),
}))
`;
  const rawOut = execFileSync('python3', ['-c', pyScript], {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout: 15_000,
  });
  const parsed = JSON.parse(rawOut.trim()) as {
    boundedFallback: boolean;
    criticalGap: boolean;
    manyFallbacks: boolean;
    untestedClean: boolean;
    knownFallback: boolean;
    betterSecond: boolean;
    notBetter: boolean;
    tie: boolean;
    penalty: [number, number, number];
  };

  assert.equal(parsed.boundedFallback, false);
  assert.equal(parsed.criticalGap, true);
  assert.equal(parsed.manyFallbacks, true);
  assert.equal(parsed.untestedClean, false);
  assert.equal(parsed.knownFallback, false);
  assert.equal(parsed.betterSecond, true);
  assert.equal(parsed.notBetter, false);
  assert.equal(parsed.tie, false);
  assert.deepEqual(parsed.penalty, [1, 3, -1]);
});

test('auto-try keeps the alternate result only when it has fewer gaps', () => {
  const pyScript = `
import importlib.util, io, json, os, sys, tempfile, types

stub = types.ModuleType("fmsave")
stub.__version__ = "0.14.4"
sys.modules["fmsave"] = stub

spec = importlib.util.spec_from_file_location("fm_save_mapper", "public/fm-save-mapper.py")
mapper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mapper)

def fake_attempt(base_cmd, layout_base, output_path, compat_path, checkpoint_file=None, relay_checkpoints=True):
    base = layout_base or "27.1"
    with open(output_path, "w", encoding="utf-8") as fh:
        json.dump({"meta": {"layoutBase": base}}, fh)
    if checkpoint_file:
        stage_path = checkpoint_file[:-5] + "-stage_2_club_core.json"
        with open(stage_path, "w", encoding="utf-8") as fh:
            json.dump({"layoutBase": base}, fh)
    sections = (
        [{"id": "players", "status": "clean"}]
        if base == "27.0"
        else [{"id": "players", "status": "unavailable"}]
    )
    with open(compat_path, "w", encoding="utf-8") as fh:
        json.dump({
            "isUntestedBuild": True,
            "layoutBase": base,
            "sections": sections,
        }, fh)
    return 0

mapper._run_layout_attempt = fake_attempt
parsed = types.SimpleNamespace(file="test.fm", club_hint="", layout_base=None)
target_dir = tempfile.mkdtemp()
target_checkpoint = os.path.join(target_dir, "server-cp.json")
buf = io.BytesIO()
class Capture:
    buffer = buf
    def flush(self):
        pass
real_stdout = sys.stdout
sys.stdout = Capture()
rc = mapper._run_auto_try_layout_cli(
    parsed, "managed_club_only", False, "test.fm", target_checkpoint
)
sys.stdout = real_stdout
stage_path = os.path.join(target_dir, "server-cp-stage_2_club_core.json")
with open(stage_path, encoding="utf-8") as fh:
    checkpoint = json.load(fh)
print(json.dumps({
    "rc": rc,
    "chosen": json.loads(buf.getvalue()),
    "checkpointBase": checkpoint.get("layoutBase"),
}))
`;
  const rawOut = execFileSync('python3', ['-c', pyScript], {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout: 15_000,
  });
  const parsed = JSON.parse(rawOut.trim()) as {
    rc: number;
    chosen: { meta: { layoutBase: string } };
    checkpointBase: string;
  };

  assert.equal(parsed.rc, 0);
  assert.equal(parsed.chosen.meta.layoutBase, '27.0');
  assert.equal(parsed.checkpointBase, '27.0');
});

test('auto-try skips the second full decode for bounded fallbacks', () => {
  const pyScript = `
import importlib.util, io, json, os, sys, tempfile, types

stub = types.ModuleType("fmsave")
stub.__version__ = "0.14.4"
sys.modules["fmsave"] = stub

spec = importlib.util.spec_from_file_location("fm_save_mapper", "public/fm-save-mapper.py")
mapper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mapper)

calls = []
def fake_attempt(base_cmd, layout_base, output_path, compat_path, checkpoint_file=None, relay_checkpoints=True):
    calls.append(layout_base)
    with open(output_path, "w", encoding="utf-8") as fh:
        json.dump({"meta": {"layoutBase": layout_base or "27.0"}}, fh)
    with open(compat_path, "w", encoding="utf-8") as fh:
        json.dump({
            "isUntestedBuild": True,
            "layoutBase": layout_base or "27.0",
            "sections": [
                {"id": "players", "status": "clean"},
                {"id": "squad_planner", "status": "fallback"},
                {"id": "managed_club", "status": "fallback"},
                {"id": "scouting_budget", "status": "fallback"},
                {"id": "league_table", "status": "unavailable"},
            ],
        }, fh)
    return 0

mapper._run_layout_attempt = fake_attempt
parsed = types.SimpleNamespace(file="test.fm", club_hint="", layout_base="27.0")
buf = io.BytesIO()
class Capture:
    buffer = buf
    def flush(self):
        pass
real_stdout = sys.stdout
sys.stdout = Capture()
rc = mapper._run_auto_try_layout_cli(parsed, "managed_club_only", False, "test.fm")
sys.stdout = real_stdout
print(json.dumps({
    "rc": rc,
    "attempts": calls,
    "chosen": json.loads(buf.getvalue()).get("meta", {}).get("layoutBase"),
}))
`;
  const rawOut = execFileSync('python3', ['-c', pyScript], {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout: 15_000,
  });
  const parsed = JSON.parse(rawOut.trim()) as {
    rc: number;
    attempts: Array<string | null>;
    chosen: string;
  };

  assert.equal(parsed.rc, 0);
  assert.deepEqual(parsed.attempts, ['27.0']);
  assert.equal(parsed.chosen, '27.0');
});
