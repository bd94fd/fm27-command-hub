/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * One compare tray for the whole app, so a current squad member and a scouted
 * target can sit side by side in the same 3-slot comparison.
 */

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { RecruitmentTarget } from '../types/fmSave';
import {
  isTargetInCompareTray,
  toggleCompareTrayEntry,
  type CompareTrayToggleResult,
} from '../utils/compareTray';

interface CompareTrayContextValue {
  targets: RecruitmentTarget[];
  isOpen: boolean;
  setOpen: (open: boolean) => void;
  isInTray: (uid: number) => boolean;
  toggle: (target: RecruitmentTarget) => CompareTrayToggleResult;
  clear: () => void;
}

const CompareTrayContext = createContext<CompareTrayContextValue | null>(null);

export const CompareTrayProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [targets, setTargets] = useState<RecruitmentTarget[]>([]);
  const [isOpen, setOpen] = useState(false);
  // Mirrors `targets` so `toggle` can report the outcome synchronously.
  const targetsRef = useRef<RecruitmentTarget[]>(targets);

  const toggle = useCallback((target: RecruitmentTarget): CompareTrayToggleResult => {
    const outcome = toggleCompareTrayEntry(targetsRef.current, target);
    if (outcome.result === 'full') return 'full';

    targetsRef.current = outcome.targets;
    setTargets(outcome.targets);
    if (outcome.result === 'removed' && outcome.targets.length === 0) {
      setOpen(false);
    }
    return outcome.result;
  }, []);

  const clear = useCallback(() => {
    targetsRef.current = [];
    setTargets([]);
    setOpen(false);
  }, []);

  const value = useMemo<CompareTrayContextValue>(
    () => ({
      targets,
      isOpen,
      setOpen,
      isInTray: (uid: number) => isTargetInCompareTray(targets, uid),
      toggle,
      clear,
    }),
    [targets, isOpen, toggle, clear]
  );

  return (
    <CompareTrayContext.Provider value={value}>{children}</CompareTrayContext.Provider>
  );
};

export function useCompareTray(): CompareTrayContextValue {
  const context = useContext(CompareTrayContext);
  if (!context) {
    throw new Error('useCompareTray must be used inside a CompareTrayProvider');
  }
  return context;
}
