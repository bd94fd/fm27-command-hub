/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, Check, ClipboardCopy, RefreshCw, RotateCcw } from 'lucide-react';
import { clearPersistedFmState } from '../services/fmStorage';
import {
  buildErrorReport,
  copyErrorReport,
  rememberLastErrorReport,
  sendErrorReport,
  type ErrorReport,
} from '../utils/errorReport';

interface AppErrorBoundaryProps {
  children: ReactNode;
  scopeLabel?: string;
  onResetTab?: () => void;
}

interface AppErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
  lastReport: ErrorReport | null;
  copyState: 'idle' | 'copied' | 'failed';
}

export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  public state: AppErrorBoundaryState = {
    hasError: false,
    errorMessage: '',
    lastReport: null,
    copyState: 'idle',
  };

  public static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || 'Unexpected rendering error occurred.',
      lastReport: null,
      copyState: 'idle',
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const report = buildErrorReport({
      error,
      scope: this.props.scopeLabel || 'Command Hub Workspace',
      context: { component: 'AppErrorBoundary' },
    });
    rememberLastErrorReport(report);
    void sendErrorReport(report);
    console.error(
      `[FM27 ErrorBoundary${this.props.scopeLabel ? ` - ${this.props.scopeLabel}` : ''}]`,
      error,
      errorInfo
    );
    this.setState({ lastReport: report });
  }

  private handleRetry = (): void => {
    this.setState({
      hasError: false,
      errorMessage: '',
      lastReport: null,
      copyState: 'idle',
    });
    if (this.props.onResetTab) {
      this.props.onResetTab();
    }
  };

  private handleCopyReport = async (): Promise<void> => {
    const report =
      this.state.lastReport ??
      buildErrorReport({
        error: new Error(this.state.errorMessage || 'Unexpected rendering error'),
        scope: this.props.scopeLabel || 'Command Hub Workspace',
        context: { component: 'AppErrorBoundary' },
      });
    const copied = await copyErrorReport(report);
    this.setState({ copyState: copied ? 'copied' : 'failed' });
  };

  private handleResetCacheAndReload = async (): Promise<void> => {
    try {
      await clearPersistedFmState();
      const [{ clearProgressionArchive }, { clearAllSaveCache }] =
        await Promise.all([
          import('../utils/progressionDiff'),
          import('../services/saveCache'),
        ]);
      clearProgressionArchive();
      await clearAllSaveCache();
    } catch {
      // ignore storage errors
    }
    this.setState({ hasError: false, errorMessage: '' });
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  public render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const label = this.props.scopeLabel || 'Command Hub Workspace';

    return (
      <div
        role="alert"
        className="rounded-2xl border border-rose-500/40 bg-slate-900/95 p-6 text-slate-100 shadow-xl space-y-4 max-w-2xl mx-auto my-6"
      >
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-rose-500/20 border border-rose-500/40 p-2.5 text-rose-300 shrink-0">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="space-y-1 min-w-0">
            <h2 className="text-base font-bold text-white">
              {label} encountered an unexpected data issue
            </h2>
            <p className="text-xs text-slate-300 leading-relaxed">
              Your original <code className="font-mono text-emerald-300">.fm</code> save file on disk is completely untouched. You can reload this view immediately or reset the browser cache if a corrupted snapshot was loaded.
            </p>
          </div>
        </div>

        {this.state.errorMessage && (
          <div className="rounded-xl border border-slate-800 bg-slate-950/85 px-3.5 py-2.5 font-mono text-micro text-rose-300 break-words">
            {this.state.errorMessage}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2.5 pt-1">
          <button
            type="button"
            onClick={this.handleRetry}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 px-3.5 py-2 text-xs font-semibold text-emerald-200 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Reload View
          </button>

          <button
            type="button"
            onClick={this.handleCopyReport}
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3.5 py-2 text-xs font-semibold text-slate-200 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          >
            {this.state.copyState === 'copied' ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <ClipboardCopy className="h-3.5 w-3.5" />
            )}
            {this.state.copyState === 'copied'
              ? 'Copied Error Report'
              : this.state.copyState === 'failed'
                ? 'Copy Failed — Try Again'
                : 'Copy Error Report'}
          </button>

          <button
            type="button"
            onClick={this.handleResetCacheAndReload}
            className="inline-flex items-center gap-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/35 px-3.5 py-2 text-xs font-semibold text-rose-200 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset Local Cache &amp; Reload
          </button>
        </div>
      </div>
    );
  }
}
