/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Browser-only delivery for the share and export panel: save a file, turn the report
 * card SVG into a PNG, open the print sheet, and copy or share a link. The pure report
 * builders live in `reportExport.ts`; everything here touches the DOM.
 */

import { REPORT_CARD_HEIGHT, REPORT_CARD_WIDTH } from './reportExport';

export function downloadTextFile(filename: string, text: string, mime = 'text/csv'): boolean {
  try {
    const blob = new Blob([text], { type: `${mime};charset=utf-8` });
    return downloadBlob(filename, blob);
  } catch {
    return false;
  }
}

export function downloadBlob(filename: string, blob: Blob): boolean {
  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return false;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoking immediately can cancel the download in Safari, so give it a beat.
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return true;
}

export async function svgToPngBlob(
  svg: string,
  width = REPORT_CARD_WIDTH,
  height = REPORT_CARD_HEIGHT
): Promise<Blob | null> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') return null;
  const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const image = new Image();
  const loaded = new Promise<boolean>((resolve) => {
    image.onload = () => resolve(true);
    image.onerror = () => resolve(false);
  });
  image.src = svgUrl;
  if (!(await loaded)) return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.fillStyle = '#0f172a';
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png');
  });
}

export async function downloadReportCardPng(
  svg: string,
  filename: string
): Promise<boolean> {
  const blob = await svgToPngBlob(svg);
  if (!blob) return false;
  return downloadBlob(filename, blob);
}

/**
 * Prints a standalone document from a hidden same-origin frame. A pop-up would be blocked
 * on many phones, and `window.open` hands back no reference in some browsers, so the
 * sheet is written into the current page instead.
 */
export function printHtmlDocument(html: string): boolean {
  if (typeof document === 'undefined' || !document.body) return false;
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.setAttribute('title', 'Printable report');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(frame);
  const frameDocument = frame.contentDocument;
  const frameWindow = frame.contentWindow;
  if (!frameDocument || !frameWindow) {
    frame.remove();
    return false;
  }
  try {
    frameDocument.open();
    frameDocument.write(html);
    frameDocument.close();
  } catch {
    frame.remove();
    return false;
  }
  const cleanup = () => setTimeout(() => frame.remove(), 500);
  try {
    frameWindow.addEventListener('afterprint', cleanup, { once: true });
  } catch {
    // Older browsers have no afterprint; the timer below still cleans up.
  }
  setTimeout(() => frame.remove(), 60_000);
  try {
    frameWindow.focus();
    frameWindow.print();
  } catch {
    return false;
  }
  return true;
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the textarea path.
  }
  if (typeof document === 'undefined') return false;
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', 'true');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

export type ShareLinkOutcome = 'shared' | 'copied' | 'cancelled' | 'failed';

/**
 * Uses the phone share sheet when the browser offers one, otherwise copies the link.
 * A dismissed share sheet is not an error, so it is reported separately.
 */
export async function shareReportLink(params: {
  title: string;
  text: string;
  url: string;
}): Promise<ShareLinkOutcome> {
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  if (canShare) {
    try {
      await navigator.share(params);
      return 'shared';
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return 'cancelled';
    }
  }
  return (await copyTextToClipboard(params.url)) ? 'copied' : 'failed';
}

export function buildShareUrl(origin: string, pathname: string, token: string): string {
  const base = `${origin}${pathname}`.replace(/\/$/, '');
  return `${base}/?share=${token}`;
}
