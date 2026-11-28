/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef } from 'react';
import { acquireBodyScrollLock, findFocusAnchor, getFocusableElements, releaseBodyScrollLock } from '../utils/focusTrap';

interface UseModalDialogOptions {
  isOpen: boolean;
  onClose: () => void;
  /** The surface that receives focus; it must carry tabIndex={-1}. */
  surfaceRef: React.RefObject<HTMLElement | null>;
  /** The element that contains both the overlay and the surface. */
  rootRef: React.RefObject<HTMLElement | null>;
  disableEscape?: boolean;
}

/**
 * The keyboard contract every modal surface in the app shares: lock the page
 * behind it, put focus on the first control, keep Tab and focus inside, close on
 * Escape, and hand focus back to whatever opened it.
 */
export function useModalDialog({
  isOpen,
  onClose,
  surfaceRef,
  rootRef,
  disableEscape = false,
}: UseModalDialogOptions): void {
  // Latest callbacks in refs so a parent re-render cannot re-run the focus effect
  // and steal focus back to the first control mid-interaction.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const disableEscapeRef = useRef(disableEscape);
  disableEscapeRef.current = disableEscape;

  useEffect(() => {
    if (!isOpen) return;
    acquireBodyScrollLock();

    const previouslyFocused =
      typeof document !== 'undefined'
        ? (document.activeElement as HTMLElement | null)
        : null;

    const focusInitial = () => {
      const surface = surfaceRef.current;
      if (!surface) return;
      const focusable = getFocusableElements(surface);
      (focusable[0] ?? surface).focus();
    };
    // Focus synchronously: rAF never fires while the page is hidden or
    // occluded (background tab, headless run), which would leave focus on the
    // page behind the sheet. The rAF pass only covers late-mounting content.
    focusInitial();
    const raf =
      typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame(() => {
            const surface = surfaceRef.current;
            if (surface && !surface.contains(document.activeElement)) focusInitial();
          })
        : null;

    const handleWindowKeyDown = (e: KeyboardEvent) => {
      if (!disableEscapeRef.current && e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
      }
    };
    // While the sheet is modal, anything outside it that grabs focus is pulled
    // back. This also covers late-mounting content and re-renders that would
    // otherwise leave focus on the page behind (WCAG 2.4.3).
    const onFocusIn = (event: FocusEvent) => {
      const root = rootRef.current;
      const target = event.target as Node | null;
      if (!root || !target || target === document.body) return;
      if (!root.contains(target)) focusInitial();
    };

    // A re-render can swap out the focused node, which drops focus to <body>
    // without firing focusin; watch for that and pull focus back too.
    const onFocusOut = (event: FocusEvent) => {
      const root = rootRef.current;
      if (!root) return;
      const next = event.relatedTarget as Node | null;
      if (next && root.contains(next)) return;
      setTimeout(() => {
        const surface = surfaceRef.current;
        if (surface && !surface.contains(document.activeElement)) focusInitial();
      }, 0);
    };

    window.addEventListener('keydown', handleWindowKeyDown);
    document.addEventListener('focusin', onFocusIn, true);
    document.addEventListener('focusout', onFocusOut, true);
    return () => {
      if (raf !== null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(raf);
      }
      releaseBodyScrollLock();
      window.removeEventListener('keydown', handleWindowKeyDown);
      document.removeEventListener('focusin', onFocusIn, true);
      document.removeEventListener('focusout', onFocusOut, true);
      // A hidden or unmounted opener cannot take focus back: on mobile the share
      // and knowledge base sheets open from the More sheet, which closes behind
      // them. Fall back to the page's own navigation instead of dropping focus.
      const stillMounted =
        previouslyFocused &&
        (typeof document === 'undefined' ||
          (document.contains(previouslyFocused) &&
            previouslyFocused.getClientRects().length > 0));
      const returnTarget = stillMounted ? previouslyFocused : findFocusAnchor();
      returnTarget?.focus?.();
    };
  }, [isOpen, surfaceRef, rootRef]);
}
