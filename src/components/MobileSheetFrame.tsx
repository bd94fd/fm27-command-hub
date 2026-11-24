/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';
import { X } from 'lucide-react';

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

export interface MobileSheetFrameClassOptions {
  maxWidthClass?: string;
  alignTopDesktop?: boolean;
}

export function getMobileSheetFrameClasses(
  options: MobileSheetFrameClassOptions = {}
): {
  overlayClass: string;
  surfaceClass: string;
  closeButtonClass: string;
} {
  const { maxWidthClass = 'sm:max-w-2xl', alignTopDesktop = false } = options;

  const desktopAlignClass = alignTopDesktop
    ? 'sm:items-start sm:pt-16 md:pt-20'
    : 'sm:items-center';

  return {
    overlayClass: `fixed inset-0 z-50 flex items-end justify-center bg-slate-950/80 backdrop-blur-sm p-0 sm:p-4 ${desktopAlignClass}`,
    surfaceClass: `relative z-10 w-full ${maxWidthClass} max-h-[92dvh] sm:max-h-[90dvh] rounded-t-2xl sm:rounded-2xl border-t sm:border border-slate-700/90 bg-slate-900 text-slate-100 shadow-2xl flex flex-col overflow-hidden`,
    closeButtonClass:
      'min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl bg-slate-800/90 hover:bg-slate-700 border border-slate-700 text-slate-200 hover:text-white transition-colors cursor-pointer shrink-0',
  };
}

export interface MobileSheetFrameProps {
  isOpen: boolean;
  onClose: () => void;
  ariaLabel: string;
  maxWidthClass?: string;
  alignTopDesktop?: boolean;
  /** Standard sticky header content rendered alongside the built-in 44px close button. */
  header?: React.ReactNode;
  /** Optional action controls placed next to the sticky 44px close button. */
  headerActions?: React.ReactNode;
  /** Fully custom sticky header (must render its own 44px close control, e.g. CommandPalette). */
  customHeader?: React.ReactNode;
  /** Optional sticky sub-header pinned directly beneath the main header (e.g. tab strip). */
  subHeader?: React.ReactNode;
  /** Optional sticky footer pinned to the bottom of the sheet (with safe-area inset). */
  footer?: React.ReactNode;
  footerClassName?: string;
  closeAriaLabel?: string;
  bodyClassName?: string;
  onKeyDown?: React.KeyboardEventHandler<HTMLDivElement>;
  disableWindowEscape?: boolean;
  children: React.ReactNode;
}

export const MobileSheetFrame: React.FC<MobileSheetFrameProps> = ({
  isOpen,
  onClose,
  ariaLabel,
  maxWidthClass = 'sm:max-w-2xl',
  alignTopDesktop = false,
  header,
  headerActions,
  customHeader,
  subHeader,
  footer,
  footerClassName = '',
  closeAriaLabel = 'Close dialog',
  bodyClassName = 'p-4 sm:p-5',
  onKeyDown,
  disableWindowEscape = false,
  children,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    acquireBodyScrollLock();

    const handleWindowKeyDown = (e: KeyboardEvent) => {
      if (!disableWindowEscape && e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleWindowKeyDown);
    return () => {
      releaseBodyScrollLock();
      window.removeEventListener('keydown', handleWindowKeyDown);
    };
  }, [isOpen, onClose, disableWindowEscape]);

  if (!isOpen) return null;

  const { overlayClass, surfaceClass, closeButtonClass } =
    getMobileSheetFrameClasses({
      maxWidthClass,
      alignTopDesktop,
    });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={overlayClass}
      onClick={onClose}
    >
      <div
        className={surfaceClass}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile bottom-sheet grab handle */}
        <div className="sm:hidden pt-2.5 pb-1 flex justify-center shrink-0 bg-slate-900">
          <span
            aria-hidden="true"
            className="w-10 h-1 rounded-full bg-slate-700"
          />
        </div>

        {/* Sticky 44px+ Header / Close Bar */}
        {customHeader ? (
          <div className="shrink-0 border-b border-slate-800 bg-slate-900/95 backdrop-blur">
            {customHeader}
          </div>
        ) : (
          <div className="shrink-0 flex items-start justify-between gap-3 border-b border-slate-800 bg-slate-900/95 px-4 sm:px-5 py-3 backdrop-blur">
            <div className="min-w-0 flex-1">{header}</div>
            <div className="flex items-center gap-2 shrink-0">
              {headerActions}
              <button
                type="button"
                onClick={onClose}
                aria-label={closeAriaLabel}
                className={closeButtonClass}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        )}

        {/* Optional sticky sub-header (e.g. tabs) */}
        {subHeader && <div className="shrink-0">{subHeader}</div>}

        {/* Scrollable Sheet Body */}
        <div
          className={`flex-1 min-h-0 overflow-y-auto overscroll-contain ${bodyClassName}`}
          style={
            footer && !footerClassName.includes('hidden')
              ? undefined
              : {
                  paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0px))',
                }
          }
        >
          {children}
        </div>

        {/* Optional sticky footer */}
        {footer && (
          <div
            className={`shrink-0 border-t border-slate-800 bg-slate-900/95 px-4 sm:px-5 pt-3 backdrop-blur ${footerClassName}`}
            style={{
              paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))',
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
