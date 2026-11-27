/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useMemo, useState } from 'react';
import { decodeShareSummary } from '../utils/shareSummary';

/** `?share=` carries a read-only report; everything else is the owner's own hub. */
export function parseShareToken(search: string): string | null {
  if (!search) return null;
  const token = new URLSearchParams(search).get('share');
  return token && token.trim() ? token.trim() : null;
}

/** The same page without `?share=`, so the owner can leave the read-only view. */
export function stripShareParam(href: string): string {
  const url = new URL(href);
  url.searchParams.delete('share');
  return `${url.pathname}${url.search}${url.hash}`;
}

export interface ShareSummaryState {
  shareToken: string | null;
  sharedSummary: ReturnType<typeof decodeShareSummary>;
  openOwnHub: () => void;
}

export function useShareSummary(): ShareSummaryState {
  const [shareToken] = useState<string | null>(() =>
    typeof window === 'undefined' ? null : parseShareToken(window.location.search)
  );
  const sharedSummary = useMemo(
    () => (shareToken ? decodeShareSummary(shareToken) : null),
    [shareToken]
  );

  const openOwnHub = useCallback(() => {
    if (typeof window === 'undefined') return;
    window.history.replaceState({}, '', stripShareParam(window.location.href));
    window.location.reload();
  }, []);

  return { shareToken, sharedSummary, openOwnHub };
}
