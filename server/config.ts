export interface ServerConfig {
  port: number;
  nodeEnv: string;
  geminiApiKey: string;
  geminiModelOverride: string | null;
  geminiFastModelOverride: string;
  fallbackModel: string;
  preferredModels: readonly string[];
  aiTimeoutMs: number;
  deepAiTimeoutMs: number;
  hubAccessToken: string | null;
  maxImageBytes: number;
  maxContextChars: number;
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
}

export const FALLBACK_GEMINI_MODEL = 'gemini-3.5-flash-lite';
export const PREFERRED_GEMINI_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-3.5-flash',
] as const;
export const DEFAULT_AI_TIMEOUT_MS = 45_000;
export const DEEP_AI_TIMEOUT_MS = 60_000;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_CONTEXT_CHARS = 18_000; // Matches 15.5k liveAppContext + headroom so Squad Profiles & Journey are never truncated
export const DEFAULT_RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
export const DEFAULT_RATE_LIMIT_MAX_REQUESTS = 60;

/**
 * Loads strictly server-side configuration.
 * Never falls back to VITE_GEMINI_API_KEY or any client-exposed env var.
 */
export function loadServerConfig(
  env: NodeJS.ProcessEnv = process.env
): ServerConfig {
  const nodeEnv = (env.NODE_ENV || 'development').trim();
  const isDev = nodeEnv !== 'production';
  const defaultAppPort = Number(env.DEFAULT_APP_PORT) || 3000;
  const rawPort = Number(env.PORT);
  const nginxPort = Number(env.NGINX_PORT);
  const port =
    isDev || (rawPort > 0 && nginxPort > 0 && rawPort === nginxPort)
      ? defaultAppPort
      : rawPort || defaultAppPort;
  const geminiApiKey = (env.GEMINI_API_KEY || '').trim();
  const rawModelOverride = (env.GEMINI_MODEL || '').trim();
  const rawFastModelOverride = (env.GEMINI_FAST_MODEL || '').trim();
  const rawHubToken = (env.HUB_ACCESS_TOKEN || '').trim();

  return {
    port,
    nodeEnv,
    geminiApiKey,
    geminiModelOverride: rawModelOverride || null,
    geminiFastModelOverride: rawFastModelOverride || FALLBACK_GEMINI_MODEL,
    fallbackModel: FALLBACK_GEMINI_MODEL,
    preferredModels: PREFERRED_GEMINI_MODELS,
    aiTimeoutMs: DEFAULT_AI_TIMEOUT_MS,
    deepAiTimeoutMs: DEEP_AI_TIMEOUT_MS,
    hubAccessToken: rawHubToken || null,
    maxImageBytes: MAX_IMAGE_BYTES,
    maxContextChars: MAX_CONTEXT_CHARS,
    rateLimitWindowMs:
      Number(env.RATE_LIMIT_WINDOW_MS) || DEFAULT_RATE_LIMIT_WINDOW_MS,
    rateLimitMaxRequests:
      Number(env.RATE_LIMIT_MAX_REQUESTS) || DEFAULT_RATE_LIMIT_MAX_REQUESTS,
  };
}
