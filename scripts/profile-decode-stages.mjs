#!/usr/bin/env node
/**
 * Builds a decode-stage profile from a benchmark JSON and decoded payloads.
 *
 * The benchmark records upload/decode/transfer/hydrate/render marks and server
 * job timings. The decoded payload records the Python decoder's own step
 * timings. This script joins the two by file name and reports where time went.
 *
 * Usage:
 *   npm run profile:decode -- \
 *     --benchmark .agents_tmp/benchmarks/save-load-r14-mobile.json \
 *     --decoded-dir .agents_tmp/decoded \
 *     --out .agents_tmp/benchmarks/decode-stage-profile.json
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSaveLoadStageProfile } from '../src/utils/decodeStageProfile.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const args = {
    benchmark: '.agents_tmp/benchmarks/save-load-baseline-mobile.json',
    decodedDir: '.agents_tmp/decoded',
    out: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--benchmark') args.benchmark = argv[++i];
    else if (arg === '--decoded-dir') args.decodedDir = argv[++i];
    else if (arg === '--out') args.out = argv[++i];
    else if (arg === '--help' || arg === '-h') {
      console.log('See the header of scripts/profile-decode-stages.mjs for usage.');
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function resolveFromRoot(value) {
  return path.isAbsolute(value) ? value : path.join(repoRoot, value);
}

async function readDecodedPayloads(directory) {
  const payloads = new Map();
  for (const entry of await fs.readdir(directory)) {
    if (!entry.endsWith('.json')) continue;
    const filePath = path.join(directory, entry);
    try {
      const payload = JSON.parse(await fs.readFile(filePath, 'utf8'));
      const fileName = payload?.meta?.fileName;
      if (typeof fileName === 'string' && fileName) {
        payloads.set(path.basename(fileName), payload);
      }
    } catch {
      // Ignore partial or unrelated JSON files.
    }
  }
  return payloads;
}

const args = parseArgs(process.argv.slice(2));
const benchmarkPath = resolveFromRoot(args.benchmark);
const benchmark = JSON.parse(await fs.readFile(benchmarkPath, 'utf8'));
const decoded = await readDecodedPayloads(resolveFromRoot(args.decodedDir));

const profiles = (benchmark.results ?? []).map((result) => {
  const payload = decoded.get(path.basename(result.save));
  const record = {
    id: path.basename(result.save),
    fileName: result.save,
    fileSizeBytes: result.saveSizeBytes,
    mode: result.mode === 'fast' ? 'fast' : 'full',
    startedAtIso: '',
    startedAtMs: 0,
    completedAtIso: result.cold?.completedAtIso ?? null,
    marksMs: result.cold?.marksMs ?? {},
    detailMs: result.cold?.detailMs ?? {},
  };
  return {
    save: result.save,
    profile: buildSaveLoadStageProfile(record, payload?.stepTimingsMs),
  };
});

console.log('Decode-stage profile');
console.log('====================');
for (const { save, profile } of profiles) {
  console.log(`\n${save} (${profile.fileSizeMb} MB)`);
  console.log(
    `  upload ${profile.uploadMs}ms | decode ${profile.decodeMs}ms | transfer ${profile.transferMs}ms | hydrate ${profile.hydrateMs}ms | render ${profile.renderMs}ms`,
  );
  console.log(
    `  decoder measured ${profile.decoderMeasuredMs}ms | server job ${profile.serverDetailMs.jobToDoneMs ?? '—'}ms | unattributed ${profile.unattributedDecodeMs}ms`,
  );
  for (const step of profile.decodeSteps) {
    console.log(
      `    ${String(step.ms).padStart(7)}ms ${String(step.sharePct).padStart(5)}% ${step.label}`,
    );
  }
}

const output = {
  generatedAtIso: new Date().toISOString(),
  benchmark: path.relative(repoRoot, benchmarkPath),
  profiles,
};
if (args.out) {
  const outPath = resolveFromRoot(args.out);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`\nWrote ${path.relative(repoRoot, outPath)}`);
}
