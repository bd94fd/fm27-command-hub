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
  error?: string;
}

export const DEFAULT_LIVE_BRIDGE_URL = 'http://127.0.0.1:2727';

/**
 * Probes an optional local FM27 companion HTTP endpoint with a short timeout.
 */
export async function probeLiveBridge(
  endpoint = DEFAULT_LIVE_BRIDGE_URL,
  timeoutMs = 1500
): Promise<LiveBridgeStatus> {
  const cleanEndpoint = endpoint.replace(/\/+$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${cleanEndpoint}/status`, {
      method: 'GET',
      signal: controller.signal,
    });
    if (!res.ok) {
      return {
        connected: false,
        endpoint: cleanEndpoint,
        inGameDate: null,
        nextMatch: null,
        error: `HTTP ${res.status}`,
      };
    }
    const data = (await res.json()) as {
      inGameDate?: string;
      date?: string;
      nextMatch?: string;
    };
    return {
      connected: true,
      endpoint: cleanEndpoint,
      inGameDate: data.inGameDate ?? data.date ?? null,
      nextMatch: data.nextMatch ?? null,
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
