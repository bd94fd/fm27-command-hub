/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Client-side error reports for user support. Reports are local-first and
 * intentionally small: no save file, player/staff records, prompts, images or
 * API keys. The same redaction is applied again on the server before logging.
 */

import { redactSensitiveText } from './errorRedaction.ts';

export const ERROR_REPORT_VERSION = 1;

const SAFE_CONTEXT_KEYS = new Set([
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

const APP_VERSION =
  (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env
    ?.VITE_APP_VERSION || '1.0.0';

export interface ErrorReportError {
  name: string;
  message: string;
  stack?: string;
}

export interface ErrorReport {
  reportVersion: number;
  createdAtIso: string;
  app: {
    name: string;
    version: string;
  };
  scope: string;
  route: string;
  userAgent: string;
  error: ErrorReportError;
  context: Record<string, string | number | boolean | null>;
}

export interface BuildErrorReportInput {
  error: unknown;
  scope: string;
  context?: Record<string, unknown>;
  route?: string;
  userAgent?: string;
}

declare global {
  interface Window {
    __FM27_LAST_ERROR_REPORT__?: ErrorReport;
  }
}

let lastReport: ErrorReport | null = null;

function currentRoute(): string {
  if (typeof window === 'undefined') return '';
  return window.location?.pathname || '';
}

function currentUserAgent(): string {
  if (typeof navigator === 'undefined') return '';
  return navigator.userAgent || '';
}

function safeText(value: unknown, maxLength = 300): string {
  if (typeof value !== 'string') return '';
  return redactSensitiveText(value, maxLength);
}

function safeRoute(value: unknown): string {
  return safeText(value, 200).split(/[?#]/)[0] || '';
}

function normalizeError(error: unknown): ErrorReportError {
  if (error instanceof Error) {
    return {
      name: safeText(error.name, 80) || 'Error',
      message: safeText(error.message, 1200) || 'No error message.',
      ...(error.stack ? { stack: redactSensitiveText(error.stack, 6000) } : {}),
    };
  }
  if (typeof error === 'string') {
    return {
      name: 'Error',
      message: safeText(error, 1200) || 'No error message.',
    };
  }
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    return {
      name: safeText(record.name, 80) || 'Error',
      message:
        safeText(record.message, 1200) ||
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

function sanitizeContext(
  context: Record<string, unknown> | undefined
): Record<string, string | number | boolean | null> {
  if (!context) return {};
  const output: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(context)) {
    if (!SAFE_CONTEXT_KEYS.has(key.toLowerCase())) continue;
    if (value === null || typeof value === 'boolean') {
      output[key] = value;
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      output[key] = value;
    } else if (typeof value === 'string') {
      output[key] = redactSensitiveText(value, 200);
    }
  }
  return output;
}

export function buildErrorReport(input: BuildErrorReportInput): ErrorReport {
  return {
    reportVersion: ERROR_REPORT_VERSION,
    createdAtIso: new Date().toISOString(),
    app: {
      name: 'fm27-command-hub',
      version: APP_VERSION,
    },
    scope: safeText(input.scope, 80) || 'unknown',
    route: safeRoute(input.route ?? currentRoute()),
    userAgent: safeText(input.userAgent ?? currentUserAgent(), 300),
    error: normalizeError(input.error),
    context: sanitizeContext(input.context),
  };
}

export function formatErrorReport(report: ErrorReport): string {
  const lines = [
    'FM27 Command Hub error report',
    `Created: ${report.createdAtIso}`,
    `App: ${report.app.name} ${report.app.version}`,
    `Scope: ${report.scope}`,
    `Route: ${report.route || '--'}`,
    `Browser: ${report.userAgent || '--'}`,
    '',
    `Error: ${report.error.name}: ${report.error.message}`,
  ];

  const contextEntries = Object.entries(report.context);
  if (contextEntries.length > 0) {
    lines.push('', 'Context:');
    for (const [key, value] of contextEntries) {
      lines.push(`  ${key}: ${String(value)}`);
    }
  }

  if (report.error.stack) {
    lines.push('', 'Stack:', report.error.stack);
  }

  lines.push(
    '',
    'This report excludes save files, player/staff records, prompts, images and API keys.'
  );

  return lines.join('\n');
}

export function rememberLastErrorReport(report: ErrorReport): void {
  lastReport = report;
  if (typeof window !== 'undefined') {
    window.__FM27_LAST_ERROR_REPORT__ = report;
  }
}

export function getLastErrorReport(): ErrorReport | null {
  if (lastReport) return lastReport;
  if (typeof window !== 'undefined' && window.__FM27_LAST_ERROR_REPORT__) {
    return window.__FM27_LAST_ERROR_REPORT__;
  }
  return null;
}

export function clearLastErrorReport(): void {
  lastReport = null;
  if (typeof window !== 'undefined') {
    delete window.__FM27_LAST_ERROR_REPORT__;
  }
}

export async function sendErrorReport(report: ErrorReport): Promise<boolean> {
  if (typeof window === 'undefined' || typeof window.fetch !== 'function') {
    return false;
  }
  try {
    const response = await window.fetch('/api/fm27/client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ report }),
      keepalive: true,
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function copyErrorReport(report: ErrorReport): Promise<boolean> {
  const text = formatErrorReport(report);
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to the textarea fallback.
    }
  }
  if (typeof document === 'undefined') return false;
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', 'true');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    textarea.remove();
    return copied;
  } catch {
    return false;
  }
}

export function installGlobalErrorReporting(): () => void {
  if (typeof window === 'undefined') return () => {};

  const recent = new Map<string, number>();
  const reportOnce = (scope: string, error: unknown) => {
    const report = buildErrorReport({ error, scope });
    const dedupeKey = `${report.error.name}:${report.error.message}:${report.error.stack || ''}`;
    const now = Date.now();
    const last = recent.get(dedupeKey) ?? 0;
    if (now - last < 5000) return;
    recent.set(dedupeKey, now);
    rememberLastErrorReport(report);
    console.warn(`[FM27 ${scope}]`, report.error.message);
    void sendErrorReport(report);
  };

  const onError = (event: ErrorEvent) => {
    reportOnce('window.error', event.error ?? event.message);
  };
  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    reportOnce('unhandledrejection', event.reason);
  };

  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onUnhandledRejection);
  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onUnhandledRejection);
  };
}
