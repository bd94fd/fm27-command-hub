import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  auditDecoderFieldCoverage,
  formatDecoderCoverageMarkdown,
  mergeDecoderFieldCoverage,
} from '../src/utils/decoderFieldCoverage.ts';

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const dir = argValue('--dir', '.agents_tmp/decoded');
const out = argValue('--out', '');
const files = readdirSync(dir)
  .filter((name) => name.endsWith('.json'))
  .sort();

if (files.length === 0) {
  console.error(`No decoded JSON files found in ${dir}`);
  process.exit(1);
}

const audits = files.map((name) => {
  const payload = JSON.parse(readFileSync(path.join(dir, name), 'utf8'));
  return { label: name.replace(/\.json$/, ''), rows: auditDecoderFieldCoverage(payload) };
});

const merged = mergeDecoderFieldCoverage(audits);
const markdown = formatDecoderCoverageMarkdown(merged, {
  date: new Date().toISOString().slice(0, 10),
  saves: files.length,
  source: dir,
});

if (out) {
  writeFileSync(out, `${markdown}\n`);
  console.log(`Wrote ${out}`);
} else {
  process.stdout.write(`${markdown}\n`);
}
