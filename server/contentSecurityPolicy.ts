/**
 * Content-Security-Policy for the production server.
 *
 * The app has no auth-less third-party script tags and no innerHTML sinks, so
 * this is defence in depth: if a save-derived string ever reaches a DOM sink,
 * the page cannot load new code or send the save somewhere else.
 *
 * Two allowances are real requirements, not convenience:
 * - `'wasm-unsafe-eval'`: the phone decoder compiles WebAssembly.
 * - `https://cdn.jsdelivr.net`: Pyodide is loaded from there by the save worker.
 *
 * Development is left alone because the Vite dev server injects inline scripts
 * and needs a websocket for hot reload.
 */

export type ContentSecurityPolicyDecision =
  | { enabled: true; directives: Record<string, string[]> }
  | { enabled: false };

export function buildContentSecurityPolicy(nodeEnv: string): ContentSecurityPolicyDecision {
  if (nodeEnv !== 'production') return { enabled: false };
  return {
    enabled: true,
    directives: {
      'default-src': ["'self'"],
      'script-src': ["'self'", "'wasm-unsafe-eval'", 'https://cdn.jsdelivr.net'],
      'worker-src': ["'self'", 'blob:'],
      'child-src': ["'self'", 'blob:'],
      'connect-src': [
        "'self'",
        'https://cdn.jsdelivr.net',
        'https://pypi.org',
        'https://files.pythonhosted.org',
      ],
      // React inline styles and the theme switcher write style attributes.
      'style-src': ["'self'", "'unsafe-inline'"],
      'img-src': ["'self'", 'data:', 'blob:'],
      'font-src': ["'self'", 'data:'],
      'media-src': ["'self'"],
      'manifest-src': ["'self'"],
      'object-src': ["'none'"],
      'frame-src': ["'none'"],
      'frame-ancestors': ["'self'"],
      'base-uri': ["'self'"],
      'form-action': ["'self'"],
      'upgrade-insecure-requests': [],
    },
  };
}
