import { GoogleGenAI } from '@google/genai';
import {
  FALLBACK_GEMINI_MODEL,
  loadServerConfig,
  type ServerConfig,
} from './config.ts';

export const MODEL_DISCOVERY_TTL_MS = 5 * 60 * 1000; // 5 minutes
export const FAST_MODEL_ID = 'gemini-3.5-flash-lite';
export const DEEP_MODEL_ID = 'gemini-3.6-flash';

export type ReasoningMode = 'fast_lite' | 'deep_high' | 'max_xhigh';

const RETIRED_MODEL_RE = /^(?:models\/)?gemini-(?:1\.|2\.0|2\.5)/i;

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
      `The Tactical Analyst timed out after ${Math.round(timeoutMs / 1000)}s. Please try again with a shorter prompt.`
    );
    this.name = 'AnalystTimeoutError';
  }
}

export class AnalystOverloadError extends Error {
  readonly status = 503;

  constructor(
    message = 'The AI Tactical Analyst is temporarily busy due to high demand. Automatic retries and model failover were attempted — please wait a few seconds and try again.'
  ) {
    super(message);
    this.name = 'AnalystOverloadError';
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
    msg
  );
}

export function formatFriendlyGeminiError(err: unknown): string {
  if (err instanceof AnalystTimeoutError) {
    return err.message;
  }
  if (err instanceof AnalystOverloadError || isTransientOverloadError(err)) {
    return 'The AI Tactical Analyst is temporarily busy due to high demand. Automatic retries and model failover were attempted — please wait a few seconds and try again.';
  }
  const raw = err instanceof Error ? err.message : String(err || '');
  const trimmed = raw.trim();
  if (!trimmed) {
    return 'The Tactical Analyst encountered an unexpected error. Please try again.';
  }
  // Unwrap raw JSON error blobs returned by Google GenAI SDK / upstream proxies
  if (trimmed.includes('{"error"') || trimmed.startsWith('{')) {
    const jsonStart = trimmed.indexOf('{');
    try {
      const parsed = JSON.parse(trimmed.slice(jsonStart)) as {
        error?: { message?: string; status?: string; code?: number };
        message?: string;
      };
      const innerCode = parsed.error?.code;
      const innerStatus = parsed.error?.status || '';
      const innerMsg = parsed.error?.message || parsed.message || '';
      if (
        innerCode === 503 ||
        innerCode === 429 ||
        /UNAVAILABLE|RESOURCE_EXHAUSTED|high demand|overloaded/i.test(
          `${innerStatus} ${innerMsg}`
        )
      ) {
        return 'The AI Tactical Analyst is temporarily busy due to high demand. Automatic retries and model failover were attempted — please wait a few seconds and try again.';
      }
      if (innerMsg) {
        return innerMsg;
      }
    } catch {
      return 'The Tactical Analyst encountered a temporary service error. Please try again in a moment.';
    }
  }
  return trimmed;
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
        'GEMINI_API_KEY is missing. Set GEMINI_API_KEY in your .env file or cloud environment variables.'
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

    const fallbackList = this.config.preferredModels.filter(
      (m) => !isRetiredGeminiModel(m)
    );

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
    const discovered = await this.discoverModels();

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
    if (
      options?.reasoningMode === 'deep_high' ||
      options?.reasoningMode === 'max_xhigh'
    ) {
      const override = pickIfActive(this.config.geminiModelOverride);
      return override ?? DEEP_MODEL_ID;
    }

    // 3. Server GEMINI_MODEL override
    const envOverride = pickIfActive(this.config.geminiModelOverride);
    if (envOverride) return envOverride;

    // 4. First preferred model present in discovered list
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
    }
  ) {
    const client = this.getClient();
    const isDeepMode =
      options?.reasoningMode === 'deep_high' ||
      options?.reasoningMode === 'max_xhigh';
    const defaultModeTimeout = isDeepMode
      ? this.config.deepAiTimeoutMs ?? this.config.aiTimeoutMs
      : this.config.aiTimeoutMs;
    const timeoutMs = options?.timeoutMs ?? defaultModeTimeout;
    const primaryModel = await this.resolveModel({
      reasoningMode: options?.reasoningMode,
      requestedModel: options?.requestedModel,
    });
    const fallbackModel = this.config.fallbackModel || FALLBACK_GEMINI_MODEL;
    const fastModel = this.getFastModelId();
    const deadline = this.now() + timeoutMs;

    const invoke = async (model: string, capDeadline = deadline) => {
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
        const callPromise = client.models.generateContent({
          ...params,
          model,
          config: {
            ...baseConfig,
            abortSignal,
          },
        });
        // Prevent Node unhandledRejection if timeoutPromise settles first and callPromise rejects later
        callPromise.catch(() => {});

        return await Promise.race([callPromise, timeoutPromise]);
      } catch (err: unknown) {
        if (isTimeoutLike(err)) {
          throw new AnalystTimeoutError(timeoutMs);
        }
        throw err;
      } finally {
        if (timerHandle) clearTimeout(timerHandle);
      }
    };

    const resolveFailoverModel = (model: string): string => {
      if (model === DEEP_MODEL_ID) return fastModel;
      if (model === fastModel) return DEEP_MODEL_ID;
      return model !== fallbackModel ? fallbackModel : DEEP_MODEL_ID;
    };

    const invokeWithOverloadRetry = async (model: string, capDeadline = deadline) => {
      let lastErr: unknown;
      for (let attempt = 0; attempt <= OVERLOAD_RETRY_DELAYS_MS.length; attempt++) {
        try {
          return await invoke(model, capDeadline);
        } catch (err: unknown) {
          lastErr = err;
          if (!isTransientOverloadError(err)) {
            throw err;
          }
          if (attempt < OVERLOAD_RETRY_DELAYS_MS.length) {
            const delayMs = OVERLOAD_RETRY_DELAYS_MS[attempt];
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
    const canTimeoutFailoverToFast =
      primaryModel !== fastModel && timeoutMs >= 30_000;
    const primaryDeadline = canTimeoutFailoverToFast
      ? this.now() + Math.round(timeoutMs * 0.67)
      : deadline;

    try {
      return await invokeWithOverloadRetry(primaryModel, primaryDeadline);
    } catch (err: unknown) {
      if (isNotFoundError(err)) {
        this.clearDiscoveryCache();
        if (primaryModel !== fallbackModel) {
          return await invokeWithOverloadRetry(fallbackModel);
        }
      }
      if (
        err instanceof AnalystTimeoutError &&
        canTimeoutFailoverToFast &&
        deadline - this.now() > 2_000
      ) {
        return await invokeWithOverloadRetry(fastModel, deadline);
      }
      if (isTransientOverloadError(err)) {
        const failoverModel = resolveFailoverModel(primaryModel);
        if (failoverModel !== primaryModel && deadline - this.now() > 500) {
          try {
            return await invokeWithOverloadRetry(failoverModel);
          } catch (failoverErr: unknown) {
            if (isTransientOverloadError(failoverErr)) {
              throw new AnalystOverloadError();
            }
            throw failoverErr;
          }
        }
        throw new AnalystOverloadError();
      }
      throw err;
    }
  }
}
