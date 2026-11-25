import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';

test('auto-try layout only retries untested builds with fallbacks or gaps', () => {
  const pyScript = `
import importlib.util, json, sys, types

stub = types.ModuleType("fmsave")
stub.__version__ = "0.14.4"
sys.modules["fmsave"] = stub

spec = importlib.util.spec_from_file_location("fm_save_mapper", "public/fm-save-mapper.py")
mapper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mapper)

fallback = {
    "isUntestedBuild": True,
    "layoutBase": "27.1",
    "sections": [
        {"id": "players", "status": "clean"},
        {"id": "tactics_set_piece", "status": "fallback"},
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
known = {**fallback, "isUntestedBuild": False}

print(json.dumps({
    "untestedFallback": mapper.should_try_alternate_layout(fallback),
    "untestedClean": mapper.should_try_alternate_layout(clean),
    "knownFallback": mapper.should_try_alternate_layout(known),
    "betterSecond": mapper.choose_better_layout_compat(fallback, clean),
    "notBetter": mapper.choose_better_layout_compat(clean, fallback),
    "tie": mapper.choose_better_layout_compat(fallback, fallback),
    "penalty": mapper._layout_compat_penalty(fallback),
}))
`;
  const rawOut = execFileSync('python3', ['-c', pyScript], {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout: 15_000,
  });
  const parsed = JSON.parse(rawOut.trim()) as {
    untestedFallback: boolean;
    untestedClean: boolean;
    knownFallback: boolean;
    betterSecond: boolean;
    notBetter: boolean;
    tie: boolean;
    penalty: [number, number, number];
  };

  assert.equal(parsed.untestedFallback, true);
  assert.equal(parsed.untestedClean, false);
  assert.equal(parsed.knownFallback, false);
  assert.equal(parsed.betterSecond, true);
  assert.equal(parsed.notBetter, false);
  assert.equal(parsed.tie, false);
  assert.deepEqual(parsed.penalty, [0, 1, -1]);
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
        else [{"id": "players", "status": "clean"}, {"id": "tactics_set_piece", "status": "fallback"}]
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
