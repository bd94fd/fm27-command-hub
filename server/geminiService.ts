import { GoogleGenAI } from '@google/genai';
import {
  FALLBACK_GEMINI_MODEL,
  loadServerConfig,
  type ServerConfig,
} from './config.ts';

export const MODEL_DISCOVERY_TTL_MS = 5 * 60 * 1000; // 5 minutes
export const FAST_MODEL_ID = 'gemini-3.5-flash-lite';
export const DEEP_MODEL_ID = 'gemini-3.5-flash';

export type ReasoningMode = 'fast_lite' | 'deep_high' | 'max_xhigh';

const RETIRED_MODEL_RE = /^(?:models\/)?gemini-(?:1\.|2\.0|2\.5|3\.8)/i;

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

export function isNotFoundError(err: unknown): boolean {
  if (!err) return false;
  if (typeof err === 'object' && 'status' in err && (err as { status?: unknown }).status === 404) {
    return true;
  }
  const msg = err instanceof Error ? err.message : String(err);
  return /\b404\b|NOT_FOUND|no longer available|not found/i.test(msg);
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
}

export class GeminiService {
  private readonly config: ServerConfig;
  private readonly clientFactory: (apiKey: string) => GeminiClientLike;
  private readonly now: () => number;
  private discoveryCache: DiscoveryCacheEntry | null = null;

  constructor(options: GeminiServiceOptions = {}) {
    this.config = options.config ?? loadServerConfig();
    this.clientFactory = options.clientFactory ?? createGeminiClient;
    this.now = options.now ?? (() => Date.now());
  }

  getConfig(): ServerConfig {
    return this.config;
  }

  hasApiKey(): boolean {
    return Boolean(this.config.geminiApiKey);
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
   * Resolves the target model, respecting Fast (gemini-3.5-flash-lite) vs. Deep (gemini-3.5-flash)
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
      return FAST_MODEL_ID;
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
    const timeoutMs = options?.timeoutMs ?? this.config.aiTimeoutMs;
    const primaryModel = await this.resolveModel({
      reasoningMode: options?.reasoningMode,
      requestedModel: options?.requestedModel,
    });
    const fallbackModel = this.config.fallbackModel || FALLBACK_GEMINI_MODEL;
    const deadline = this.now() + timeoutMs;

    const invoke = async (model: string) => {
      const remainingMs = deadline - this.now();
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

    try {
      return await invoke(primaryModel);
    } catch (err: unknown) {
      if (isNotFoundError(err) && primaryModel !== fallbackModel) {
        return await invoke(fallbackModel);
      }
      throw err;
    }
  }
}
