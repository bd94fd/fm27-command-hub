import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

const sources = () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(tsx?|css)$/.test(entry.name) && !entry.name.includes('.test.')) files.push(full);
    }
  };
  walk('src');
  return files.map((file) => ({ file, text: fs.readFileSync(file, 'utf8') }));
};

const hits = (pattern: RegExp, classOnly = true) =>
  sources()
    .filter(({ file, text }) => !classOnly || (/className|classNames|clsx/.test(text) && !file.endsWith('.css')))
    .flatMap(({ file, text }) =>
      [...text.matchAll(pattern)].map((m) => `${file}: ${m[0]}`)
    );

test('type sizes come from the scale, never from a pixel literal', () => {
  assert.deepEqual(hits(/text-\[\d+(?:\.\d+)?px\]/g, false), []);
  assert.deepEqual(hits(/text-\[\d+rem\]/g), []);
});

test('the three micro tokens are defined once, in the theme', () => {
  const css = read('src/index.css');
  assert.match(css, /@theme\s*\{/);
  assert.match(css, /--text-3xs:\s*0\.5625rem/);
  assert.match(css, /--text-2xs:\s*0\.625rem/);
  assert.match(css, /--text-micro:\s*0\.6875rem/);
  for (const token of ['3xs', '2xs', 'micro']) {
    assert.ok(css.includes(`--text-${token}--line-height`), `${token} needs a line height`);
  }
  // One definition each: a second @theme block would silently shadow the first.
  assert.equal((css.match(/--text-micro:/g) ?? []).length, 1);
});

test('radius follows five roles: md, lg, xl, 2xl, full', () => {
  assert.deepEqual(hits(/(?<![\w-])rounded(?![\w-])/g), []);
  assert.deepEqual(hits(/rounded-(?:sm|xs|3xl|4xl)(?![\w-])/g), []);
  assert.deepEqual(hits(/rounded-\[[^\]]+\]/g), []);
});

test('surfaces follow the five documented roles', () => {
  const allowed = new Set([
    'bg-slate-950/60', 'bg-slate-950/75', 'bg-slate-950/85',
    'bg-slate-900/70', 'bg-slate-900/50', 'bg-slate-900/95',
    'bg-slate-800/70',
  ]);
  const offenders = hits(/bg-slate-(?:950|900|800)\/\d+/g).filter((hit) => {
    const cls = hit.split(': ')[1];
    return !allowed.has(cls);
  });
  assert.deepEqual(offenders, []);
});

test('the scrim stays distinct from card surfaces', () => {
  // bg-slate-950/75 is the modal backdrop; cards must not borrow it.
  for (const { file, text } of sources()) {
    for (const match of text.matchAll(/bg-slate-950\/75/g)) {
      const window = text.slice(Math.max(0, match.index! - 160), match.index! + 160);
      assert.match(window, /inset-0/, `${file} uses the scrim colour without inset-0`);
    }
  }
});

test('font weights come from medium, semibold, bold', () => {
  assert.deepEqual(hits(/font-(?:thin|extralight|light|extrabold|black)(?![\w-])/g), []);
});

test('spacing uses the Tailwind scale, not pixel literals', () => {
  assert.deepEqual(hits(/(?<![\w-])(?:p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|space-y|space-x)-\[\d+(?:\.\d+)?px\]/g), []);
});
