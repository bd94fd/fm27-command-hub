/**
 * Sends the optional HUB_ACCESS_TOKEN with API requests.
 *
 * The server checks this token when the operator sets one. Nothing used to send
 * it, so turning the check on locked the owner out of their own app. The token is
 * never built into the bundle: it is asked for once, on the device, after a 401,
 * and kept in localStorage.
 */

export const HUB_TOKEN_STORAGE_KEY = 'fm27_hub_access_token_v1';

export interface HubAuthOptions {
  fetchImpl?: typeof fetch;
  /** Return the token, or null if the user declines. Defaults to window.prompt. */
  promptForToken?: () => string | null;
  /** Off for background reports, which must never open a dialog. */
  promptOnUnauthorized?: boolean;
}

const DEFAULT_PROMPT =
  'This Hub is protected. Paste the access token set on the server (HUB_ACCESS_TOKEN). It is kept on this device only.';

let promptedThisPageLoad = false;

export function readStoredHubToken(): string | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const stored = localStorage.getItem(HUB_TOKEN_STORAGE_KEY);
    return stored && stored.trim() ? stored.trim() : null;
  } catch {
    return null;
  }
}

export function storeHubToken(token: string | null): void {
  if (typeof localStorage === 'undefined') return;
  try {
    if (token && token.trim()) {
      localStorage.setItem(HUB_TOKEN_STORAGE_KEY, token.trim());
    } else {
      localStorage.removeItem(HUB_TOKEN_STORAGE_KEY);
    }
  } catch {
    // A blocked localStorage only costs the user a prompt on the next request.
  }
}

function defaultPrompt(): string | null {
  if (typeof window === 'undefined' || typeof window.prompt !== 'function') return null;
  const answer = window.prompt(DEFAULT_PROMPT);
  return answer && answer.trim() ? answer.trim() : null;
}

function withAuthHeader(init: RequestInit, token: string | null): RequestInit {
  const headers = new Headers(init.headers);
  if (token) headers.set('x-hub-access-token', token);
  return { ...init, headers };
}

/** A body that can be sent twice; a stream cannot. */
function bodyIsReplayable(body: BodyInit | null | undefined): boolean {
  return !(typeof ReadableStream !== 'undefined' && body instanceof ReadableStream);
}

export async function hubAuthFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
  options: HubAuthOptions = {}
): Promise<Response> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const allowPrompt = options.promptOnUnauthorized !== false;
  const token = readStoredHubToken();
  const response = await fetchImpl(input, withAuthHeader(init, token));
  if (response.status !== 401 || !allowPrompt || promptedThisPageLoad) return response;
  if (!bodyIsReplayable(init.body)) return response;

  promptedThisPageLoad = true;
  const answered = (options.promptForToken ?? defaultPrompt)();
  if (!answered) return response;
  storeHubToken(answered);
  return fetchImpl(input, withAuthHeader(init, answered));
}

/** Test seam: forget that a prompt already happened on this page load. */
export function resetHubAuthPromptStateForTests(): void {
  promptedThisPageLoad = false;
}
