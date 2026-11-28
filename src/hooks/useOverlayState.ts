/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useState } from 'react';
import type { PlayerRecord, StaffRecord } from '../types/fm27';
import type { CalibrationLabTab } from '../components/Fm27BinaryCalibrationLab';
import { useSheetHistory } from './useHistoryNavigation';

/**
 * Every surface that floats over the workspace, and the two global shortcuts
 * that open one. Kept in one place so the shell does not carry a dozen
 * booleans, and so "is anything open" cannot drift out of step with the list.
 */
export function useOverlayState() {
  const [showMoreSheet, setShowMoreSheet] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showKnowledgeBase, setShowKnowledgeBase] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [calibrationLabOpen, setCalibrationLabOpen] = useState(false);
  const [calibrationLabTab, setCalibrationLabTab] = useState<CalibrationLabTab>('roles');
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerRecord | null>(null);
  const [selectedStaff, setSelectedStaff] = useState<StaffRecord | null>(null);

  // These three do not use MobileSheetFrame, so the shell owns their Back entries.
  useSheetHistory(showMoreSheet, () => setShowMoreSheet(false));
  useSheetHistory(showKnowledgeBase, () => setShowKnowledgeBase(false));
  useSheetHistory(calibrationLabOpen, () => setCalibrationLabOpen(false));

  const openCalibrationLab = useCallback((tab: CalibrationLabTab = 'roles') => {
    setCalibrationLabTab(tab);
    setCalibrationLabOpen(true);
  }, []);

  const anyOverlayOpen =
    showMoreSheet ||
    showCommandPalette ||
    showKnowledgeBase ||
    calibrationLabOpen ||
    Boolean(selectedPlayer) ||
    Boolean(selectedStaff);

  const closeAll = useCallback(() => {
    setShowMoreSheet(false);
    setShowShareModal(false);
    setShowKnowledgeBase(false);
    setShowCommandPalette(false);
    setCalibrationLabOpen(false);
    setSelectedPlayer(null);
    setSelectedStaff(null);
  }, []);

  useEffect(() => {
    const onGlobalKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setShowCommandPalette((previous) => !previous);
      }
    };
    window.addEventListener('keydown', onGlobalKeyDown);
    return () => window.removeEventListener('keydown', onGlobalKeyDown);
  }, []);

  return {
    showMoreSheet,
    setShowMoreSheet,
    showShareModal,
    setShowShareModal,
    showKnowledgeBase,
    setShowKnowledgeBase,
    showCommandPalette,
    setShowCommandPalette,
    calibrationLabOpen,
    setCalibrationLabOpen,
    calibrationLabTab,
    openCalibrationLab,
    selectedPlayer,
    setSelectedPlayer,
    selectedStaff,
    setSelectedStaff,
    anyOverlayOpen,
    closeAll,
  };
}
