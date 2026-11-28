/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface RowActivationEvent {
  key: string;
  target: EventTarget | null;
  currentTarget: EventTarget | null;
  shiftKey?: boolean;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  repeat?: boolean;
}

/**
 * A clickable table row opens on Enter or Space. Only the row itself counts:
 * a nested control inside it (the compare toggle) keeps its own keys so one
 * press cannot both toggle and open.
 */
export function shouldActivateRowFromKey(event: RowActivationEvent): boolean {
  if (event.key !== 'Enter' && event.key !== ' ') return false;
  if (event.target !== event.currentTarget) return false;
  if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return false;
  if (event.repeat) return false;
  return true;
}
