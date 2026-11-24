/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, RotateCcw } from 'lucide-react';
import { clearPersistedFmState } from '../services/fmStorage';
import { clearProgressionArchive } from '../utils/progressionDiff';

interface AppErrorBoundaryProps {
  children: ReactNode;
  scopeLabel?: string;
  onResetTab?: () => void;
}

interface AppErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  public state: AppErrorBoundaryState = {
    hasError: false,
    errorMessage: '',
  };

  public static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || 'Unexpected rendering error occurred.',
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error(
      `[FM27 ErrorBoundary${this.props.scopeLabel ? ` - ${this.props.scopeLabel}` : ''}]`,
      error,
      errorInfo
    );
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false, errorMessage: '' });
    if (this.props.onResetTab) {
      this.props.onResetTab();
    }
  };

  private handleResetCacheAndReload = async (): Promise<void> => {
    try {
      await clearPersistedFmState();
      clearProgressionArchive();
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
          <div className="rounded-xl border border-slate-800 bg-slate-950/90 px-3.5 py-2.5 font-mono text-[11px] text-rose-300 break-words">
            {this.state.errorMessage}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2.5 pt-1">
          <button
            type="button"
            onClick={this.handleRetry}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 px-3.5 py-2 text-xs font-semibold text-emerald-200 transition cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Reload View
          </button>

          <button
            type="button"
            onClick={this.handleResetCacheAndReload}
            className="inline-flex items-center gap-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/35 px-3.5 py-2 text-xs font-semibold text-rose-200 transition cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset Local Cache &amp; Reload
          </button>
        </div>
      </div>
    );
  }
}
