import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();

const walk = (dir: string): string[] =>
  fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(rel);
    return /\.(ts|tsx)$/.test(entry.name) ? [rel] : [];
  });

const sourceFiles = () =>
  [...walk('src'), ...walk('server')].filter((rel) => !/\.test\.tsx?$/.test(rel));

test('no source file escapes the type system with any', () => {
  const offenders: string[] = [];
  for (const rel of sourceFiles()) {
    const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    text.split('\n').forEach((line, index) => {
      const stripped = line.replace(/\/\/.*$/, '');
      if (/:\s*any\b|as any\b|<any>/.test(stripped)) {
        offenders.push(`${rel}:${index + 1} ${line.trim()}`);
      }
    });
  }
  assert.deepEqual(offenders, []);
});

test('the compiler keeps the checks that catch unused code and bad overrides', () => {
  const tsconfig = JSON.parse(fs.readFileSync(path.join(ROOT, 'tsconfig.json'), 'utf8'));
  for (const flag of [
    'strict',
    'noUnusedLocals',
    'noUnusedParameters',
    'noImplicitOverride',
    'noFallthroughCasesInSwitch',
    'forceConsistentCasingInFileNames',
  ]) {
    assert.equal(tsconfig.compilerOptions[flag], true, `${flag} must stay on`);
  }
});
