import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

test('keyboard focus has a ring that utility classes cannot remove', () => {
  const css = read('src/index.css');
  const rule = css.match(/:focus-visible\s*\{[^}]*\}/);
  assert.ok(rule, 'a :focus-visible rule must exist');
  assert.match(rule![0], /outline:\s*2px solid/, 'ring must be at least 2px');
  assert.match(rule![0], /outline-offset:\s*2px/);
  assert.doesNotMatch(rule![0], /border-radius/, 'must not reshape a rounded button');

  // The rule has to sit outside @layer, otherwise `focus:outline-none` wins.
  const ruleIndex = css.indexOf(':focus-visible');
  const layerBlock = css.match(/@layer\s+base\s*\{[\s\S]*?\n\}/);
  if (layerBlock) {
    const inside = css.slice(0, layerBlock.index! + layerBlock[0].length).includes(':focus-visible');
    assert.equal(inside, false, 'the focus rule must be unlayered');
  }
  assert.ok(ruleIndex > -1);

  assert.match(css, /outline-color:\s*#34d399/, 'dark mode needs its own ring colour');
  assert.match(css, /forced-colors:\s*active/, 'high-contrast mode needs a ring too');
});

test('the desktop tab strip meets the 24px minimum target size', () => {
  const header = read('src/components/shell/AppHeader.tsx');
  const tabClass = header.match(/inline-flex items-center min-h-\[36px\][^`]*/);
  assert.ok(tabClass, 'tab buttons should carry an explicit minimum height');
  assert.match(header, /md:min-h-\[36px\] flex items-center/, 'brand link needs the same floor');
  assert.doesNotMatch(header, /md:min-h-0 flex items-center text-base/, 'the old 28px brand link is gone');
});

test('filled emerald pills keep readable text in both themes', () => {
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.tsx') && read(full).includes('bg-emerald-600 text-white')) {
        offenders.push(full);
      }
    }
  };
  walk('src');
  assert.deepEqual(offenders, [], 'white on emerald-600 is 3.65:1; use emerald-700 or dark text');
});

test('the empty-state hint is not the muted grey that failed the contrast check', () => {
  const src = read('src/components/EmptyStatePanel.tsx');
  assert.match(src, /text-slate-600 dark:text-slate-400/);
  assert.doesNotMatch(src, /dark:text-slate-500/);
});

test('icon-only send button keeps an accessible name on mobile', () => {
  const src = read('src/components/analyst/AnalystComposer.tsx');
  const submit = src.slice(src.indexOf('type="submit"'), src.indexOf('type="submit"') + 400);
  assert.match(submit, /aria-label="Send message"/, 'the label is hidden below 640px');
});
