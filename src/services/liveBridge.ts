/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Plan 4: Optional Local Live Bridge for FM27 companion tools (e.g. farukkavlak/fm-cli MIT).
 * Strictly opt-in and fails gracefully when offline or on mobile.
 */

export interface LiveBridgeStatus {
  connected: boolean;
  endpoint: string;
  inGameDate: string | null;
  nextMatch: string | null;
  gameState?: string | null;
  duringMatch?: boolean;
  error?: string;
}

/**
 * Default port for farukkavlak/fm-cli BepInEx HTTP bridge (scans 7777..7786).
 * Note: direct browser fetches from HTTPS deployments to http://127.0.0.1 require
 * running locally or via a CORS-enabled local proxy.
 */
export const DEFAULT_LIVE_BRIDGE_URL = 'http://127.0.0.1:7777';

interface RawLiveBridgePayload {
  inGameDate?: string;
  date?: string;
  Date?: string;
  nextMatch?: string;
  NextMatch?: string;
  state?: string;
  State?: string;
  duringMatch?: boolean;
  DuringMatch?: boolean;
}

function parseBridgePayload(rawText: string): RawLiveBridgePayload | null {
  const trimmed = rawText.trim();
  if (!trimmed || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) {
    return null;
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as RawLiveBridgePayload)
      : null;
  } catch {
    return null;
  }
}

/**
 * Probes an optional local FM27 companion HTTP endpoint (farukkavlak/fm-cli /state
 * with legacy /status fallback) using a short timeout.
 */
export async function probeLiveBridge(
  endpoint = DEFAULT_LIVE_BRIDGE_URL,
  timeoutMs = 1500
): Promise<LiveBridgeStatus> {
  const cleanEndpoint = endpoint.replace(/\/+$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let lastStatus: number | null = null;
    for (const route of ['/state', '/status']) {
      const res = await fetch(`${cleanEndpoint}${route}`, {
        method: 'GET',
        signal: controller.signal,
      });
      lastStatus = res.status;
      if (!res.ok) {
        if (res.status === 404) continue;
        return {
          connected: false,
          endpoint: cleanEndpoint,
          inGameDate: null,
          nextMatch: null,
          error: `HTTP ${res.status}`,
        };
      }
      // fm-cli returns JSON with Content-Type: text/plain; parse via text() -> JSON.parse()
      const rawText = await res.text();
      const data = parseBridgePayload(rawText);
      if (!data) continue;
      return {
        connected: true,
        endpoint: cleanEndpoint,
        inGameDate: data.inGameDate ?? data.Date ?? data.date ?? null,
        nextMatch: data.nextMatch ?? data.NextMatch ?? null,
        gameState: data.State ?? data.state ?? null,
        duringMatch:
          typeof data.DuringMatch === 'boolean'
            ? data.DuringMatch
            : typeof data.duringMatch === 'boolean'
              ? data.duringMatch
              : undefined,
      };
    }

    // Fallback liveness check against fm-cli /health
    const healthRes = await fetch(`${cleanEndpoint}/health`, {
      method: 'GET',
      signal: controller.signal,
    });
    if (healthRes.ok) {
      return {
        connected: true,
        endpoint: cleanEndpoint,
        inGameDate: null,
        nextMatch: null,
      };
    }

    return {
      connected: false,
      endpoint: cleanEndpoint,
      inGameDate: null,
      nextMatch: null,
      error: `HTTP ${lastStatus ?? healthRes.status}`,
    };
  } catch (err) {
    return {
      connected: false,
      endpoint: cleanEndpoint,
      inGameDate: null,
      nextMatch: null,
      error: err instanceof Error ? err.message : 'Bridge unreachable',
    };
  } finally {
    clearTimeout(timer);
  }
}
