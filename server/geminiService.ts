import { GoogleGenAI, ThinkingLevel, type ThinkingConfig } from '@google/genai';
import { FALLBACK_GEMINI_MODEL, loadServerConfig, type ServerConfig } from './config.ts';

export const MODEL_DISCOVERY_TTL_MS = 5 * 60 * 1000; // 5 minutes
export const FAST_MODEL_ID = 'gemini-3.5-flash-lite';
export const DEEP_MODEL_ID = 'gemini-3.6-flash';
export const EMERGENCY_OVERLOAD_MODEL_ID = 'gemini-3.8-flash';
export const EMERGENCY_LITE_MODEL_ID = 'gemini-3.1-flash-lite';

export type ReasoningMode = 'fast_lite' | 'deep_high' | 'max_xhigh';

export interface UpstreamFailureDiagnostic {
  at: string;
  model: string;
  status: number | null;
  code: string | null;
  reason: string;
}

const RETIRED_MODEL_RE = /^(?:models\/)?gemini-(?:1\.|2\.0|2\.5)/i;

/**
 * Resolves a latency-safe ThinkingConfig for Gemini 3.x / 4.x models.
 * - fast_lite & timeout failover -> MINIMAL (or LOW on models that do not support MINIMAL)
 * - deep_high -> LOW (keeps structured tactical accuracy while ~2x faster than default MEDIUM)
 * - max_xhigh -> MEDIUM (deeper synthesis while staying safely inside the 60s timeout)
 */
export function resolveThinkingConfig(
  model: string,
  reasoningMode?: ReasoningMode,
  isFailover = false,
): ThinkingConfig | undefined {
  const normalized = normalizeModelName(model).toLowerCase();
  if (!normalized || isRetiredGeminiModel(normalized)) {
    return undefined;
  }
  if (!/^gemini-(?:3|4)/.test(normalized)) {
    return undefined;
  }
  const supportsMinimal = !/^gemini-(?:3\.8|4)/.test(normalized) && !normalized.includes('pro');

  if (isFailover || reasoningMode === 'fast_lite') {
    return {
      thinkingLevel: supportsMinimal ? ThinkingLevel.MINIMAL : ThinkingLevel.LOW,
    };
  }
  if (reasoningMode === 'max_xhigh') {
    return { thinkingLevel: ThinkingLevel.MEDIUM };
  }
  if (reasoningMode === 'deep_high') {
    return { thinkingLevel: ThinkingLevel.LOW };
  }
  return undefined;
}

export function normalizeModelName(name: string): string {
  return name.trim().replace(/^models\//i, '');
}

export function isRetiredGeminiModel(model: string): boolean {
  const trimmed = model.trim();
  if (!trimmed) return true;
  return RETIRED_MODEL_RE.test(trimmed);
}

export class AnalystTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(
      `The Tactical Analyst timed out after ${Math.round(timeoutMs / 1000)}s. Please try again with a shorter prompt.`,
    );
    this.name = 'AnalystTimeoutError';
  }
}

export class AnalystOverloadError extends Error {
  readonly status: 429 | 503;

  constructor(
    message = 'The AI Tactical Analyst is temporarily busy due to high demand. Automatic retries and model failover were attempted — please wait a few seconds and try again.',
    status: 429 | 503 = 503,
  ) {
    super(message);
    this.name = 'AnalystOverloadError';
    this.status = status;
  }
}

export function isNotFoundError(err: unknown): boolean {
  if (!err) return false;
  if (typeof err === 'object' && 'status' in err && (err as { status?: unknown }).status === 404) {
    return true;
  }
  const msg = err instanceof Error ? err.message : String(err);
  return /\b404\b|NOT_FOUND|no longer available|not found/i.test(msg);
}

export function isQuotaRateLimitError(err: unknown): boolean {
  if (!err) return false;
  if (err instanceof AnalystOverloadError) {
    return err.status === 429;
  }
  if (typeof err === 'object') {
    const status = (err as { status?: unknown }).status;
    const code = (err as { code?: unknown }).code;
    if (status === 429 || code === 429) {
      return true;
    }
  }
  const msg = err instanceof Error ? err.message : String(err);
  return /\b429\b|RESOURCE_EXHAUSTED|quota|rate limit/i.test(msg);
}

export function isHardDailyQuotaError(err: unknown): boolean {
  if (!isQuotaRateLimitError(err)) return false;
  const msg = err instanceof Error ? err.message : String(err);
  return /PerDay|daily|limit:\s*0|exceeded your current quota/i.test(msg);
}

export function isTransientOverloadError(err: unknown): boolean {
  if (!err) return false;
  if (err instanceof AnalystOverloadError) return true;
  if (typeof err === 'object') {
    const status = (err as { status?: unknown }).status;
    const code = (err as { code?: unknown }).code;
    if (status === 503 || status === 429 || code === 503 || code === 429) {
      return true;
    }
  }
  const msg = err instanceof Error ? err.message : String(err);
  return /\b(503|429)\b|UNAVAILABLE|RESOURCE_EXHAUSTED|high demand|overloaded|temporarily unavailable|rate limit/i.test(
    msg,
  );
}

/**
 * Extracts a short, non-sensitive upstream status/code/reason summary from a Gemini SDK error
 * (redacts any URLs or token-like strings).
 */
export function extractSafeUpstreamError(err: unknown): {
  status: number | null;
  code: string | null;
  reason: string;
} {
  let status: number | null = null;
  let code: string | null = null;
  if (err && typeof err === 'object') {
    const rawStatus = (err as { status?: unknown }).status;
    const rawCode = (err as { code?: unknown }).code;
    if (typeof rawStatus === 'number') status = rawStatus;
    else if (typeof rawCode === 'number') status = rawCode;
    if (typeof rawCode === 'string') code = rawCode;
  }

  const raw = err instanceof Error ? err.message : String(err || '');
  let reason = raw.trim();

  if (reason.includes('{"error"') || reason.startsWith('{')) {
    const jsonStart = reason.indexOf('{');
    try {
      const parsed = JSON.parse(reason.slice(jsonStart)) as {
        error?: { message?: string; status?: string; code?: number };
        message?: string;
      };
      if (typeof parsed.error?.code === 'number') status = parsed.error.code;
      if (typeof parsed.error?.status === 'string') code = parsed.error.status;
      if (parsed.error?.message || parsed.message) {
        reason = String(parsed.error?.message || parsed.message);
      }
    } catch {
      // Keep raw fallback
    }
  }

  const sanitized = reason
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/AIza[0-9A-Za-z_-]{10,}/g, '[REDACTED]')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    status,
    code,
    reason: sanitized.slice(0, 180) || 'Unknown upstream error',
  };
}

export function buildOverloadErrorFromCause(err: unknown): AnalystOverloadError {
  if (isQuotaRateLimitError(err)) {
    return new AnalystOverloadError(
      'Google Gemini API rate limit or daily quota has been reached for this API key across all fallback models. Please wait a minute (or check your Google AI Studio billing/quota) and try again.',
      429,
    );
  }
  return new AnalystOverloadError(
    'The AI Tactical Analyst is temporarily busy due to high demand. Automatic retries and model failover were attempted — please wait a few seconds and try again.',
    503,
  );
}

export function formatFriendlyGeminiError(err: unknown): string {
  if (err instanceof AnalystTimeoutError) {
    return err.message;
  }
  if (err instanceof AnalystOverloadError) {
    return err.message;
  }
  if (isQuotaRateLimitError(err)) {
    return 'Google Gemini API rate limit or daily quota has been reached for this API key across all fallback models. Please wait a minute (or check your Google AI Studio billing/quota) and try again.';
  }
  if (isTransientOverloadError(err)) {
    return 'The AI Tactical Analyst is temporarily busy due to high demand. Automatic retries and model failover were attempted — please wait a few seconds and try again.';
  }
  const safe = extractSafeUpstreamError(err);
  if (safe.reason && safe.reason !== 'Unknown upstream error') {
    return safe.reason;
  }
  return 'The Tactical Analyst encountered an unexpected error. Please try again.';
}

function isTimeoutLike(err: unknown): boolean {
  if (err instanceof AnalystTimeoutError) return true;
  if (err && typeof err === 'object') {
    const name = (err as { name?: string }).name || '';
    const msg = (err as { message?: string }).message || '';
    if (name === 'TimeoutError' || name === 'AbortError') return true;
    if (/aborted|timed out|timeout/i.test(msg)) return true;
  }
  return false;
}

export interface GeminiModelsClient {
  generateContent: GoogleGenAI['models']['generateContent'];
  list?: () => Promise<AsyncIterable<{ name?: string }> | { models?: Array<{ name?: string }> }>;
}

export interface GeminiClientLike {
  models: GeminiModelsClient;
}

export function createGeminiClient(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

interface DiscoveryCacheEntry {
  models: string[];
  fetchedAtMs: number;
}

export interface GeminiServiceOptions {
  config?: ServerConfig;
  clientFactory?: (apiKey: string) => GeminiClientLike;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export const OVERLOAD_RETRY_DELAYS_MS = [1500, 3000] as const;

export class GeminiService {
  private readonly config: ServerConfig;
  private readonly clientFactory: (apiKey: string) => GeminiClientLike;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private discoveryCache: DiscoveryCacheEntry | null = null;
  private lastUpstreamFailure: UpstreamFailureDiagnostic | null = null;

  constructor(options: GeminiServiceOptions = {}) {
    this.config = options.config ?? loadServerConfig();
    this.clientFactory = options.clientFactory ?? createGeminiClient;
    this.now = options.now ?? (() => Date.now());
    this.sleep =
      options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  getConfig(): ServerConfig {
    return this.config;
  }

  getLastUpstreamFailure(): UpstreamFailureDiagnostic | null {
    return this.lastUpstreamFailure;
  }

  hasApiKey(): boolean {
    return Boolean(this.config.geminiApiKey);
  }

  /**
   * Resolves the Fast model, honoring the GEMINI_FAST_MODEL env override
   * (defaults to gemini-3.5-flash-lite) while filtering retired model names.
   */
  getFastModelId(): string {
    const normalized = normalizeModelName(this.config.geminiFastModelOverride || '');
    if (!normalized || isRetiredGeminiModel(normalized)) {
      return FAST_MODEL_ID;
    }
    return normalized;
  }

  clearDiscoveryCache(): void {
    this.discoveryCache = null;
  }

  private getClient(): GeminiClientLike {
    if (!this.config.geminiApiKey) {
      throw new Error(
        'GEMINI_API_KEY is missing. Set GEMINI_API_KEY in your .env file or cloud environment variables.',
      );
    }
    return this.clientFactory(this.config.geminiApiKey);
  }

  /**
   * Discovers active Gemini models with a 5-minute TTL cache,
   * filtering out retired gemini-1.*, gemini-2.0, and gemini-2.5 prefixes.
   */
  async discoverModels(forceRefresh = false): Promise<string[]> {
    const currentMs = this.now();
    if (
      !forceRefresh &&
      this.discoveryCache &&
      currentMs - this.discoveryCache.fetchedAtMs < MODEL_DISCOVERY_TTL_MS
    ) {
      return this.discoveryCache.models;
    }

    const fallbackList = this.config.preferredModels.filter((m) => !isRetiredGeminiModel(m));

    if (!this.config.geminiApiKey) {
      this.discoveryCache = { models: fallbackList, fetchedAtMs: currentMs };
      return fallbackList;
    }

    try {
      const client = this.getClient();
      const discovered: string[] = [];

      if (typeof client.models.list === 'function') {
        const result = await client.models.list();
        if (result && Symbol.asyncIterator in Object(result)) {
          for await (const item of result as AsyncIterable<{ name?: string }>) {
            if (item?.name) {
              const normalized = normalizeModelName(item.name);
              if (normalized && !isRetiredGeminiModel(normalized)) {
                discovered.push(normalized);
              }
            }
          }
        } else if (
          result &&
          typeof result === 'object' &&
          'models' in result &&
          Array.isArray((result as { models?: Array<{ name?: string }> }).models)
        ) {
          for (const item of (result as { models: Array<{ name?: string }> }).models) {
            if (item?.name) {
              const normalized = normalizeModelName(item.name);
              if (normalized && !isRetiredGeminiModel(normalized)) {
                discovered.push(normalized);
              }
            }
          }
        }
      }

      const unique = Array.from(new Set(discovered));
      const finalModels = unique.length > 0 ? unique : fallbackList;
      this.discoveryCache = { models: finalModels, fetchedAtMs: currentMs };
      return finalModels;
    } catch {
      this.discoveryCache = { models: fallbackList, fetchedAtMs: currentMs };
      return fallbackList;
    }
  }

  /**
   * Resolves the target model, respecting Fast (gemini-3.5-flash-lite) vs. Deep (gemini-3.6-flash)
   * client preferences and optional GEMINI_MODEL override while filtering out retired models.
   */
  async resolveModel(options?: {
    reasoningMode?: ReasoningMode;
    requestedModel?: string;
  }): Promise<string> {
    const pickIfActive = (candidate: string | null | undefined): string | null => {
      if (!candidate) return null;
      const normalized = normalizeModelName(candidate);
      if (!normalized || isRetiredGeminiModel(normalized)) return null;
      return normalized;
    };

    // 1. Explicit requestedModel from caller
    const explicit = pickIfActive(options?.requestedModel);
    if (explicit) return explicit;

    // 2. Client Fast vs. Deep preference
    if (options?.reasoningMode === 'fast_lite') {
      return this.getFastModelId();
    }
    if (options?.reasoningMode === 'deep_high' || options?.reasoningMode === 'max_xhigh') {
      const override = pickIfActive(this.config.geminiModelOverride);
      return override ?? DEEP_MODEL_ID;
    }

    // 3. Server GEMINI_MODEL override
    const envOverride = pickIfActive(this.config.geminiModelOverride);
    if (envOverride) return envOverride;

    // 4. First preferred model present in discovered list (lazy-fetched only when needed)
    const discovered = await this.discoverModels();
    for (const preferred of this.config.preferredModels) {
      if (discovered.includes(preferred)) {
        return preferred;
      }
    }

    return this.config.fallbackModel || FALLBACK_GEMINI_MODEL;
  }

  /**
   * Executes generateContent with a strict timeout and a single automatic 404 retry
   * fallback to fallbackModel (gemini-3.5-flash-lite).
   */
  async generateContent(
    params: Omit<Parameters<GoogleGenAI['models']['generateContent']>[0], 'model'>,
    options?: {
      reasoningMode?: ReasoningMode;
      requestedModel?: string;
      timeoutMs?: number;
    },
  ) {
    const client = this.getClient();
    const isDeepMode =
      options?.reasoningMode === 'deep_high' || options?.reasoningMode === 'max_xhigh';
    const defaultModeTimeout = isDeepMode
      ? (this.config.deepAiTimeoutMs ?? this.config.aiTimeoutMs)
      : this.config.aiTimeoutMs;
    const timeoutMs = options?.timeoutMs ?? defaultModeTimeout;
    const primaryModel = await this.resolveModel({
      reasoningMode: options?.reasoningMode,
      requestedModel: options?.requestedModel,
    });
    const fallbackModel = this.config.fallbackModel || FALLBACK_GEMINI_MODEL;
    const fastModel = this.getFastModelId();
    const deadline = this.now() + timeoutMs;

    const invoke = async (model: string, capDeadline = deadline, isFailover = false) => {
      const remainingMs = Math.min(deadline, capDeadline) - this.now();
      if (remainingMs <= 500) {
        throw new AnalystTimeoutError(timeoutMs);
      }

      const abortSignal = AbortSignal.timeout(remainingMs);
      let timerHandle: ReturnType<typeof setTimeout> | undefined;
      try {
        const timeoutPromise = new Promise<never>((_resolve, reject) => {
          timerHandle = setTimeout(() => {
            reject(new AnalystTimeoutError(timeoutMs));
          }, remainingMs);
        });

        const baseConfig = (params.config || {}) as Record<string, unknown>;
        const resolvedThinking =
          baseConfig.thinkingConfig !== undefined
            ? baseConfig.thinkingConfig
            : resolveThinkingConfig(model, options?.reasoningMode, isFailover);
        const callPromise = client.models.generateContent({
          ...params,
          model,
          config: {
            ...baseConfig,
            ...(resolvedThinking ? { thinkingConfig: resolvedThinking } : {}),
            abortSignal,
          },
        });
        // Prevent Node unhandledRejection if timeoutPromise settles first and callPromise rejects later
        callPromise.catch(() => {});

        const result = await Promise.race([callPromise, timeoutPromise]);
        this.lastUpstreamFailure = null;
        return result;
      } catch (err: unknown) {
        const safe = extractSafeUpstreamError(err);
        this.lastUpstreamFailure = {
          at: new Date(this.now()).toISOString(),
          model,
          status: safe.status,
          code: safe.code,
          reason: safe.reason,
        };
        if (isTimeoutLike(err)) {
          throw new AnalystTimeoutError(timeoutMs);
        }
        throw err;
      } finally {
        if (timerHandle) clearTimeout(timerHandle);
      }
    };

    const resolveOverloadFailoverChain = (model: string): string[] => {
      const first =
        model === DEEP_MODEL_ID
          ? fastModel
          : model === fastModel
            ? DEEP_MODEL_ID
            : model !== fallbackModel
              ? fallbackModel
              : DEEP_MODEL_ID;
      const candidates = [first, EMERGENCY_OVERLOAD_MODEL_ID, EMERGENCY_LITE_MODEL_ID];
      const unique: string[] = [];
      for (const candidate of candidates) {
        if (
          candidate &&
          candidate !== model &&
          !isRetiredGeminiModel(candidate) &&
          !unique.includes(candidate)
        ) {
          unique.push(candidate);
        }
      }
      return unique;
    };

    const invokeWithOverloadRetry = async (
      model: string,
      capDeadline = deadline,
      isFailover = false,
    ) => {
      const retryDelays = isFailover
        ? OVERLOAD_RETRY_DELAYS_MS.slice(0, 1)
        : OVERLOAD_RETRY_DELAYS_MS;
      let lastErr: unknown;
      for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
        try {
          return await invoke(model, capDeadline, isFailover);
        } catch (err: unknown) {
          lastErr = err;
          if (!isTransientOverloadError(err)) {
            throw err;
          }
          // Do not burn retries hammering a model whose daily quota is exhausted;
          // move immediately to the next distinct model in the failover chain.
          if (isHardDailyQuotaError(err)) {
            break;
          }
          if (attempt < retryDelays.length) {
            const delayMs = retryDelays[attempt];
            const remainingMs = Math.min(deadline, capDeadline) - this.now();
            if (remainingMs <= delayMs + 500) {
              break;
            }
            await this.sleep(delayMs);
          }
        }
      }
      throw lastErr;
    };

    // Reserve ~33% of the total budget for automatic Fast-model failover when Deep Analyst runs slow
    const canTimeoutFailoverToFast = primaryModel !== fastModel && timeoutMs >= 30_000;
    const primaryDeadline = canTimeoutFailoverToFast
      ? this.now() + Math.round(timeoutMs * 0.67)
      : deadline;

    try {
      return await invokeWithOverloadRetry(primaryModel, primaryDeadline, false);
    } catch (err: unknown) {
      if (isNotFoundError(err)) {
        this.clearDiscoveryCache();
        if (primaryModel !== fallbackModel) {
          return await invokeWithOverloadRetry(fallbackModel, deadline, true);
        }
      }
      if (
        err instanceof AnalystTimeoutError &&
        canTimeoutFailoverToFast &&
        deadline - this.now() > 2_000
      ) {
        try {
          return await invokeWithOverloadRetry(fastModel, deadline, true);
        } catch (fastErr: unknown) {
          if (
            isTransientOverloadError(fastErr) &&
            EMERGENCY_OVERLOAD_MODEL_ID !== primaryModel &&
            EMERGENCY_OVERLOAD_MODEL_ID !== fastModel &&
            deadline - this.now() > 2_000
          ) {
            try {
              return await invokeWithOverloadRetry(EMERGENCY_OVERLOAD_MODEL_ID, deadline, true);
            } catch (emergencyErr: unknown) {
              if (isTransientOverloadError(emergencyErr) || isNotFoundError(emergencyErr)) {
                throw buildOverloadErrorFromCause(emergencyErr);
              }
              throw emergencyErr;
            }
          }
          throw fastErr;
        }
      }
      if (isTransientOverloadError(err)) {
        const failoverChain = resolveOverloadFailoverChain(primaryModel);
        let lastFailoverErr: unknown = err;
        for (const failoverModel of failoverChain) {
          if (deadline - this.now() <= 500) {
            break;
          }
          try {
            return await invokeWithOverloadRetry(failoverModel, deadline, true);
          } catch (failoverErr: unknown) {
            lastFailoverErr = failoverErr;
            if (isTransientOverloadError(failoverErr) || isNotFoundError(failoverErr)) {
              continue;
            }
            throw failoverErr;
          }
        }
        if (isTransientOverloadError(lastFailoverErr) || isNotFoundError(lastFailoverErr)) {
          throw buildOverloadErrorFromCause(
            isNotFoundError(lastFailoverErr) ? err : lastFailoverErr,
          );
        }
        throw lastFailoverErr;
      }
      throw err;
    }
  }
}
