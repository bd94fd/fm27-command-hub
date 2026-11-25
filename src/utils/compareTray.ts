/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Shared compare-tray rules. Shortlisted targets and current squad members go
 * through the same slot budget, so one tray can hold either kind of player.
 */

import type { RecruitmentTarget } from '../types/fmSave';

export const MAX_COMPARE_TRAY_SIZE = 3;

export type CompareTrayToggleResult = 'added' | 'removed' | 'full';

export interface CompareTrayToggleOutcome {
  targets: RecruitmentTarget[];
  result: CompareTrayToggleResult;
}

export function isTargetInCompareTray(
  targets: RecruitmentTarget[],
  uid: number
): boolean {
  return targets.some((target) => target.uid === uid);
}

export function toggleCompareTrayEntry(
  targets: RecruitmentTarget[],
  target: RecruitmentTarget,
  maxSize: number = MAX_COMPARE_TRAY_SIZE
): CompareTrayToggleOutcome {
  if (isTargetInCompareTray(targets, target.uid)) {
    return {
      targets: targets.filter((existing) => existing.uid !== target.uid),
      result: 'removed',
    };
  }
  if (targets.length >= maxSize) {
    return { targets, result: 'full' };
  }
  return { targets: [...targets, target], result: 'added' };
}
