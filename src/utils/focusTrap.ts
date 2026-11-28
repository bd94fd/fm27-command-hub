/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Focusable descendants used by a modal surface's focus trap. Disabled controls and
 * `tabindex="-1"` elements are excluded so Tab never parks on an unfocusable node.
 */
export const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

type FocusableContainer = Pick<HTMLElement, 'querySelectorAll'>;

export function getFocusableElements(
  container: FocusableContainer
): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
  ).filter((el) => {
    if (el.tabIndex < 0) return false;
    // A control that is not rendered cannot take focus, and calling focus() on
    // it silently leaves focus on the page behind the sheet.
    if (typeof el.getClientRects === 'function' && el.getClientRects().length === 0) {
      return false;
    }
    if (typeof el.closest === 'function' && el.closest('[aria-hidden="true"]')) {
      return false;
    }
    return true;
  });
}

// Reference-counted body scroll lock so stacked or rapid-swap modals never leave body frozen.
let activeScrollLockCount = 0;
let savedBodyOverflow: string | null = null;

export function acquireBodyScrollLock(doc: Pick<Document, 'body'> | null = typeof document !== 'undefined' ? document : null): void {
  if (!doc?.body) return;
  if (activeScrollLockCount === 0) {
    savedBodyOverflow = doc.body.style.overflow;
    doc.body.style.overflow = 'hidden';
  }
  activeScrollLockCount += 1;
}

export function releaseBodyScrollLock(doc: Pick<Document, 'body'> | null = typeof document !== 'undefined' ? document : null): void {
  if (activeScrollLockCount <= 0) {
    activeScrollLockCount = 0;
    return;
  }
  activeScrollLockCount -= 1;
  if (activeScrollLockCount === 0 && doc?.body) {
    doc.body.style.overflow = savedBodyOverflow ?? '';
    savedBodyOverflow = null;
  }
}

export function resetBodyScrollLockForTests(): void {
  activeScrollLockCount = 0;
  savedBodyOverflow = null;
}

/**
 * Where focus should land when the control that opened a dialog is gone: a
 * mobile sheet can be replaced by the share sheet, and the button that opened
 * it is unmounted with the sheet. The current section's navigation button is
 * the closest honest answer, so a keyboard user never falls to <body>.
 */
export function findFocusAnchor(
  doc: Pick<Document, 'querySelector'> | null = typeof document !== 'undefined' ? document : null
): HTMLElement | null {
  if (!doc) return null;
  const nav = doc.querySelector('nav[aria-label="Mobile navigation"], nav[aria-label="Primary sections"]');
  const current = nav?.querySelector<HTMLElement>('button[aria-current="page"]');
  if (current) return current;
  const firstNavButton = nav?.querySelector<HTMLElement>('button');
  if (firstNavButton) return firstNavButton;
  return doc.querySelector<HTMLElement>('header button');
}

export interface TabKeyEvent {
  key: string;
  shiftKey: boolean;
  preventDefault: () => void;
}

type TrapSurface = FocusableContainer & { focus?: () => void };

/**
 * Wraps Tab and Shift+Tab at the ends of a modal surface, and parks focus on the
 * surface itself when it holds no focusable control. Returns true when it handled
 * the key, so the caller can stop there.
 */
export function trapTabKey(
  event: TabKeyEvent,
  surface: TrapSurface | null,
  active: EventTarget | null = null
): boolean {
  if (event.key !== 'Tab' || !surface) return false;

  const focusable = getFocusableElements(surface);
  if (focusable.length === 0) {
    event.preventDefault();
    surface.focus?.();
    return true;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const activeNode = active as unknown;
  if (event.shiftKey && (activeNode === first || activeNode === surface)) {
    event.preventDefault();
    last.focus();
    return true;
  }
  if (!event.shiftKey && activeNode === last) {
    event.preventDefault();
    first.focus();
    return true;
  }
  return false;
}
