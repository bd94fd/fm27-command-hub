/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useState } from 'react';
import type { DeepJourneyReport } from '../services/saveCache';

interface AnalystHandoffOptions {
  /** The promise for a Journey report that is still being written. */
  latestJourneyPromiseRef: { current: Promise<DeepJourneyReport | null> | null };
}

/**
 * The bridge between a prompt raised somewhere else in the app and the Analyst
 * workspace: the shell holds the prompt until the workspace takes it, and holds
 * the newest Journey report so a question can refer to it.
 */
export function useAnalystHandoff({ latestJourneyPromiseRef }: AnalystHandoffOptions) {
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const [latestJourneyReport, setLatestJourneyReport] = useState<DeepJourneyReport | null>(null);

  const clearPrompt = useCallback(() => setPendingPrompt(null), []);

  const getLatestJourneyReportAsync = useCallback(
    async () => latestJourneyPromiseRef.current ?? latestJourneyReport,
    [latestJourneyReport, latestJourneyPromiseRef]
  );

  const clearJourneyReport = useCallback(() => {
    latestJourneyPromiseRef.current = null;
    setLatestJourneyReport(null);
  }, [latestJourneyPromiseRef]);

  return {
    pendingPrompt,
    setPendingPrompt,
    clearPrompt,
    latestJourneyReport,
    setLatestJourneyReport,
    getLatestJourneyReportAsync,
    clearJourneyReport,
  };
}
