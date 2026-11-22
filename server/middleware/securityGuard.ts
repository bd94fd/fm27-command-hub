import type { NextFunction, Request, Response } from 'express';
import {
  DEFAULT_RATE_LIMIT_MAX_REQUESTS,
  DEFAULT_RATE_LIMIT_WINDOW_MS,
  MAX_CONTEXT_CHARS,
  MAX_IMAGE_BYTES,
} from '../config.ts';

export interface SecurityGuardOptions {
  hubAccessToken?: string | null;
  maxImageBytes?: number;
  maxContextChars?: number;
  rateLimitWindowMs?: number;
  rateLimitMaxRequests?: number;
  now?: () => number;
}

function estimateBase64DecodedBytes(b64: string): number {
  const cleaned = b64.replace(/^data:[^;]+;base64,/i, '').replace(/\s+/g, '');
  if (!cleaned) return 0;
  const padding = cleaned.endsWith('==') ? 2 : cleaned.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((cleaned.length * 3) / 4) - padding);
}

function extractClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

export function createSecurityGuard(options: SecurityGuardOptions = {}) {
  const hubAccessToken = options.hubAccessToken ?? null;
  const maxImageBytes = options.maxImageBytes ?? MAX_IMAGE_BYTES;
  const maxContextChars = options.maxContextChars ?? MAX_CONTEXT_CHARS;
  const windowMs = options.rateLimitWindowMs ?? DEFAULT_RATE_LIMIT_WINDOW_MS;
  const maxRequests =
    options.rateLimitMaxRequests ?? DEFAULT_RATE_LIMIT_MAX_REQUESTS;
  const now = options.now ?? (() => Date.now());

  const requestTimestampsByIp = new Map<string, number[]>();
  const MAX_TRACKED_IPS = 2000;
  let lastPrunedAtMs = 0;

  function pruneStaleIps(cutoffMs: number, currentMs: number): void {
    if (
      currentMs - lastPrunedAtMs < windowMs &&
      requestTimestampsByIp.size < MAX_TRACKED_IPS
    ) {
      return;
    }
    lastPrunedAtMs = currentMs;
    for (const [trackedIp, timestamps] of requestTimestampsByIp.entries()) {
      const active = timestamps.filter((ts) => ts > cutoffMs);
      if (active.length === 0) {
        requestTimestampsByIp.delete(trackedIp);
      } else if (active.length !== timestamps.length) {
        requestTimestampsByIp.set(trackedIp, active);
      }
    }
    if (requestTimestampsByIp.size >= MAX_TRACKED_IPS) {
      const oldestKey = requestTimestampsByIp.keys().next().value;
      if (oldestKey !== undefined) {
        requestTimestampsByIp.delete(oldestKey);
      }
    }
  }

  return function securityGuard(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    // 1. Optional HUB_ACCESS_TOKEN verification
    if (hubAccessToken) {
      const authHeader =
        typeof req.headers.authorization === 'string'
          ? req.headers.authorization.trim()
          : '';
      const bearerToken = authHeader.toLowerCase().startsWith('bearer ')
        ? authHeader.slice(7).trim()
        : '';
      const headerToken =
        typeof req.headers['x-hub-access-token'] === 'string'
          ? req.headers['x-hub-access-token'].trim()
          : '';
      const provided = bearerToken || headerToken;
      if (provided !== hubAccessToken) {
        return res.status(401).json({
          error: 'Unauthorized: invalid or missing HUB_ACCESS_TOKEN.',
        });
      }
    }

    // 2. Sliding-window rate limiting per client IP with periodic stale-IP pruning
    const ip = extractClientIp(req);
    const currentMs = now();
    const cutoff = currentMs - windowMs;
    pruneStaleIps(cutoff, currentMs);
    const recent = (requestTimestampsByIp.get(ip) ?? []).filter(
      (ts) => ts > cutoff
    );
    if (recent.length >= maxRequests) {
      requestTimestampsByIp.set(ip, recent);
      return res.status(429).json({
        error: 'Rate limit exceeded. Please wait a moment before trying again.',
      });
    }
    recent.push(currentMs);
    requestTimestampsByIp.set(ip, recent);

    // 3. Payload guards for AI JSON endpoints (10 MB image cap, 10k-char context cap)
    if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
      const body = req.body as Record<string, unknown>;

      // Single screenshot image cap
      if (typeof body.imageBase64 === 'string' && body.imageBase64.length > 0) {
        const bytes = estimateBase64DecodedBytes(body.imageBase64);
        if (bytes > maxImageBytes) {
          return res.status(413).json({
            error: `Image payload exceeds the ${Math.round(maxImageBytes / (1024 * 1024))} MB limit.`,
          });
        }
      }

      // Multi-image array cap
      if (Array.isArray(body.images)) {
        let totalImageBytes = 0;
        for (const img of body.images) {
          if (
            img &&
            typeof img === 'object' &&
            typeof (img as { base64?: unknown }).base64 === 'string'
          ) {
            totalImageBytes += estimateBase64DecodedBytes(
              (img as { base64: string }).base64
            );
          }
        }
        if (totalImageBytes > maxImageBytes) {
          return res.status(413).json({
            error: `Attached images exceed the ${Math.round(maxImageBytes / (1024 * 1024))} MB limit.`,
          });
        }
      }

      // 10k-char context cap (trim gracefully if over cap so large live contexts still succeed safely)
      for (const field of ['liveAppContext', 'importedFileContext', 'notes'] as const) {
        if (typeof body[field] === 'string' && body[field].length > maxContextChars) {
          body[field] = body[field].slice(0, maxContextChars);
        }
      }
    }

    return next();
  };
}
