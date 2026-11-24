/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState } from 'react';

export const DEFAULT_KEYBOARD_THRESHOLD_PX = 140;
export const MOBILE_VIEWPORT_MAX_WIDTH = 768;

export interface EditableElementLike {
  tagName?: string;
  type?: string;
  isContentEditable?: boolean;
  readOnly?: boolean;
  disabled?: boolean;
}

const NON_TEXT_INPUT_TYPES = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'hidden',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
]);

/**
 * Returns true when an active element opens a software keyboard on mobile devices.
 */
export function isEditableInputElement(
  el: EditableElementLike | null | undefined
): boolean {
  if (!el) return false;
  if (el.disabled || el.readOnly) return false;
  if (el.isContentEditable) return true;
  const tag = (el.tagName ?? '').toUpperCase();
  if (tag === 'TEXTAREA') return true;
  if (tag === 'INPUT') {
    const inputType = (el.type ?? 'text').toLowerCase();
    return !NON_TEXT_INPUT_TYPES.has(inputType);
  }
  return false;
}

export function isMobileViewportWidth(width: number): boolean {
  return Number.isFinite(width) && width > 0 && width < MOBILE_VIEWPORT_MAX_WIDTH;
}

export interface MobileKeyboardComputationInput {
  viewportWidth: number;
  innerHeight: number;
  visualViewportHeight: number;
  baselineHeight: number;
  isEditableFocused: boolean;
  thresholdPx?: number;
}

export interface MobileKeyboardState {
  isKeyboardOpen: boolean;
  keyboardHeight: number;
}

/**
 * Pure keyboard detection logic compatible with both Android Chrome resize modes
 * (resizes-visual and resizes-content) as well as iOS Safari.
 */
export function computeMobileKeyboardState(
  input: MobileKeyboardComputationInput
): MobileKeyboardState {
  const {
    viewportWidth,
    innerHeight,
    visualViewportHeight,
    baselineHeight,
    isEditableFocused,
    thresholdPx = DEFAULT_KEYBOARD_THRESHOLD_PX,
  } = input;

  if (!isMobileViewportWidth(viewportWidth)) {
    return { isKeyboardOpen: false, keyboardHeight: 0 };
  }

  const effectiveVisualHeight =
    Number.isFinite(visualViewportHeight) && visualViewportHeight > 0
      ? visualViewportHeight
      : innerHeight;

  const deltaFromInner = Math.max(0, innerHeight - effectiveVisualHeight);
  const deltaFromBaseline = Math.max(0, baselineHeight - effectiveVisualHeight);
  const keyboardHeight = Math.round(Math.max(deltaFromInner, deltaFromBaseline));

  // If visualViewport shrank sharply relative to layout innerHeight (resizes-visual),
  // we know the virtual keyboard is open even if focusin fired slightly late.
  if (deltaFromInner >= thresholdPx) {
    return { isKeyboardOpen: true, keyboardHeight };
  }

  // If Android Chrome resized layout innerHeight too (resizes-content), require
  // an editable control to be focused so browser toolbar shifts never false-trigger.
  if (isEditableFocused && deltaFromBaseline >= Math.max(100, thresholdPx - 20)) {
    return { isKeyboardOpen: true, keyboardHeight };
  }

  return { isKeyboardOpen: false, keyboardHeight: 0 };
}

/**
 * Tracks whether the mobile virtual keyboard is open using window.visualViewport
 * so fixed bottom navigation can step aside cleanly while typing.
 */
export function useMobileKeyboard(options?: {
  thresholdPx?: number;
}): MobileKeyboardState {
  const thresholdPx = options?.thresholdPx ?? DEFAULT_KEYBOARD_THRESHOLD_PX;
  const [state, setState] = useState<MobileKeyboardState>({
    isKeyboardOpen: false,
    keyboardHeight: 0,
  });

  const baselineHeightRef = useRef<number>(
    typeof window !== 'undefined'
      ? Math.max(window.innerHeight, window.visualViewport?.height ?? 0)
      : 0
  );
  const lastWidthRef = useRef<number>(
    typeof window !== 'undefined' ? window.innerWidth : 0
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    let blurTimer: number | null = null;

    const evaluate = () => {
      const width = window.visualViewport?.width ?? window.innerWidth;
      const innerHeight = window.innerHeight;
      const vvHeight = window.visualViewport?.height ?? innerHeight;
      const activeEl = document.activeElement as EditableElementLike | null;
      const editableFocused = isEditableInputElement(activeEl);

      // Reset baseline when orientation/width changes materially
      if (Math.abs(width - lastWidthRef.current) > 60) {
        lastWidthRef.current = width;
        baselineHeightRef.current = Math.max(innerHeight, vvHeight);
      } else if (!editableFocused) {
        baselineHeightRef.current = Math.max(
          baselineHeightRef.current,
          innerHeight,
          vvHeight
        );
      }

      const next = computeMobileKeyboardState({
        viewportWidth: width,
        innerHeight,
        visualViewportHeight: vvHeight,
        baselineHeight: baselineHeightRef.current,
        isEditableFocused: editableFocused,
        thresholdPx,
      });

      setState((prev) =>
        prev.isKeyboardOpen === next.isKeyboardOpen &&
        prev.keyboardHeight === next.keyboardHeight
          ? prev
          : next
      );
    };

    const handleFocusIn = () => {
      if (blurTimer !== null) {
        window.clearTimeout(blurTimer);
        blurTimer = null;
      }
      evaluate();
      // Android Chrome often updates visualViewport 80-200ms after focusin
      window.setTimeout(evaluate, 150);
    };

    const handleFocusOut = () => {
      if (blurTimer !== null) {
        window.clearTimeout(blurTimer);
      }
      blurTimer = window.setTimeout(() => {
        blurTimer = null;
        evaluate();
      }, 120);
    };

    const handleOrientation = () => {
      baselineHeightRef.current = Math.max(
        window.innerHeight,
        window.visualViewport?.height ?? 0
      );
      lastWidthRef.current = window.visualViewport?.width ?? window.innerWidth;
      evaluate();
    };

    const vv = window.visualViewport;
    vv?.addEventListener('resize', evaluate);
    vv?.addEventListener('scroll', evaluate);
    window.addEventListener('resize', evaluate);
    window.addEventListener('orientationchange', handleOrientation);
    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);

    evaluate();

    return () => {
      if (blurTimer !== null) {
        window.clearTimeout(blurTimer);
      }
      vv?.removeEventListener('resize', evaluate);
      vv?.removeEventListener('scroll', evaluate);
      window.removeEventListener('resize', evaluate);
      window.removeEventListener('orientationchange', handleOrientation);
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
    };
  }, [thresholdPx]);

  return state;
}
