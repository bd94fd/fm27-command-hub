/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Structured server-side error events. The server never logs request bodies,
 * save payloads, prompts or API keys. Client reports are re-redacted here even
 * though the browser already sanitised them.
 */

import { randomUUID } from 'node:crypto';
import { redactForLog, redactSensitiveText } from '../src/utils/errorRedaction.ts';

export interface ErrorDetails {
  name: string;
  message: string;
  stack?: string;
}

export interface ServerErrorEvent {
  type: 'server' | 'client';
  requestId: string;
  createdAtIso: string;
  appVersion: string;
  method: string;
  path: string;
  status?: number;
  durationMs?: number;
  scope?: string;
  route?: string;
  userAgent?: string;
  error: ErrorDetails;
  context?: Record<string, unknown>;
}

interface ServerErrorInput {
  requestId?: string;
  method?: string;
  path?: string;
  status?: number;
  durationMs?: number;
  error: unknown;
  context?: Record<string, unknown>;
}

interface ClientErrorMeta {
  requestId?: string;
  method?: string;
  path?: string;
}

const SAFE_CLIENT_CONTEXT_KEYS = new Set([
  'scope',
  'route',
  'tab',
  'operation',
  'stage',
  'status',
  'statuscode',
  'httpstatus',
  'code',
  'errorcode',
  'component',
  'filetype',
  'savesizebucket',
  'requestid',
  'durationms',
  'benchmarkid',
  'transport',
  'mode',
]);

function sanitizeClientContext(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (!SAFE_CLIENT_CONTEXT_KEYS.has(key.toLowerCase())) continue;
    if (entry === null || typeof entry === 'boolean') {
      output[key] = entry;
    } else if (typeof entry === 'number' && Number.isFinite(entry)) {
      output[key] = entry;
    } else if (typeof entry === 'string') {
      output[key] = safeText(entry, 200);
    }
  }
  return Object.keys(output).length > 0 ? output : undefined;
}

function safeText(value: unknown, maxLength = 1200): string {
  if (typeof value !== 'string') return '';
  return redactSensitiveText(value, maxLength);
}

function errorDetails(error: unknown): ErrorDetails {
  if (error instanceof Error) {
    return {
      name: safeText(error.name, 80) || 'Error',
      message: safeText(error.message) || 'No error message.',
      ...(error.stack ? { stack: redactSensitiveText(error.stack, 6000) } : {}),
    };
  }
  if (typeof error === 'string') {
    return {
      name: 'Error',
      message: safeText(error) || 'No error message.',
    };
  }
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    return {
      name: safeText(record.name, 80) || 'Error',
      message:
        safeText(record.message) ||
        'A non-Error value was thrown. Payload omitted.',
      ...(typeof record.stack === 'string'
        ? { stack: redactSensitiveText(record.stack, 6000) }
        : {}),
    };
  }
  return {
    name: 'Error',
    message: 'A non-Error value was thrown. Payload omitted.',
  };
}

function requestPath(value: unknown): string {
  return safeText(value, 240).split(/[?#]/)[0] || '/';
}

export function buildServerErrorEvent(input: ServerErrorInput): ServerErrorEvent {
  return {
    type: 'server',
    requestId: input.requestId || randomUUID(),
    createdAtIso: new Date().toISOString(),
    appVersion: process.env.npm_package_version || 'unknown',
    method: safeText(input.method, 16) || 'UNKNOWN',
    path: requestPath(input.path),
    ...(typeof input.status === 'number' ? { status: input.status } : {}),
    ...(typeof input.durationMs === 'number'
      ? { durationMs: Math.max(0, Math.round(input.durationMs)) }
      : {}),
    error: errorDetails(input.error),
    ...(input.context
      ? { context: redactForLog(input.context) as Record<string, unknown> }
      : {}),
  };
}

export function buildClientErrorEvent(
  report: unknown,
  meta: ClientErrorMeta = {}
): ServerErrorEvent {
  const record =
    report && typeof report === 'object'
      ? (report as Record<string, unknown>)
      : {};
  const app =
    record.app && typeof record.app === 'object'
      ? (record.app as Record<string, unknown>)
      : {};

  return {
    type: 'client',
    requestId: meta.requestId || randomUUID(),
    createdAtIso: new Date().toISOString(),
    appVersion: safeText(app.version, 40) || 'unknown',
    method: safeText(meta.method, 16) || 'POST',
    path: requestPath(meta.path || '/api/fm27/client-error'),
    scope: safeText(record.scope, 80) || 'unknown',
    route: requestPath(record.route),
    userAgent: safeText(record.userAgent, 300),
    error: errorDetails(record.error),
    ...(record.context
      ? { context: sanitizeClientContext(record.context) }
      : {}),
  };
}

export function logServerError(event: ServerErrorEvent): void {
  console.error(`[FM27 ${event.type} error]`, JSON.stringify(event));
}
