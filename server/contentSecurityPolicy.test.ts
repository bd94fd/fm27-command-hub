import assert from 'node:assert/strict';
import test from 'node:test';
import { buildContentSecurityPolicy } from './contentSecurityPolicy.ts';

test('production sends an enforcing policy that blocks new code and exfiltration', () => {
  const csp = buildContentSecurityPolicy('production');
  assert.equal(csp.enabled, true);
  if (!csp.enabled) return;
  const d = csp.directives;

  assert.deepEqual(d['default-src'], ["'self'"]);
  assert.deepEqual(d['object-src'], ["'none'"]);
  assert.deepEqual(d['base-uri'], ["'self'"]);
  assert.deepEqual(d['form-action'], ["'self'"]);
  assert.deepEqual(d['frame-ancestors'], ["'self'"]);
  assert.ok(!('unsafe-eval' in d), 'unsafe-eval is not needed');
  assert.ok(!d['script-src'].includes('*'), 'no wildcard script source');
  assert.ok(!d['connect-src'].includes('*'), 'no wildcard connect source');
});

test('production allows exactly the sources the decoder needs', () => {
  const csp = buildContentSecurityPolicy('production');
  if (!csp.enabled) throw new Error('expected enforcement');
  assert.ok(csp.directives['script-src'].includes("'wasm-unsafe-eval'"));
  assert.ok(csp.directives['script-src'].includes('https://cdn.jsdelivr.net'));
  assert.ok(csp.directives['connect-src'].includes('https://cdn.jsdelivr.net'));
  // micropip installs the fmsave wheel from PyPI on first use.
  assert.ok(csp.directives['connect-src'].includes('https://pypi.org'));
  assert.ok(csp.directives['connect-src'].includes('https://files.pythonhosted.org'));
  assert.ok(csp.directives['worker-src'].includes('blob:'));
});

test('development keeps the policy off so Vite hot reload still works', () => {
  assert.deepEqual(buildContentSecurityPolicy('development'), { enabled: false });
  assert.deepEqual(buildContentSecurityPolicy('test'), { enabled: false });
});
