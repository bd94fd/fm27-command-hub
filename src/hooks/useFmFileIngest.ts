/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The file intake: a dropped or pasted save, screenshot or export is read,
 * decoded and published to the screens and the chat.
 *
 * The body is lifted from `AutoSyncWorkspace.tsx` unchanged. The workspace still
 * owns the state it reads and writes and passes it in.
 */

import React from 'react';
import type { DeepJourneyReport } from '../services/saveCache';
import {
  isDecodedCacheSyncModeCompatible,
  resolveDecodedPayloadFastSync,
} from '../services/saveCache';
import type { DecodedFmSavePayload, HydratedSaveState } from '../utils/fmSaveHydrator';
import type { ParsedPlayerDelta, SquadMergeResult } from '../utils/fmFileImporter';
import { assertValidDecodedFmSavePayload } from '../utils/fmSaveValidation';
import {
  finishSaveLoadBenchmark,
  markSaveLoadCacheHit,
  markSaveLoadStage,
  recordSaveLoadDetails,
  startSaveLoadBenchmark,
} from '../utils/saveLoadBenchmark';
import { recordFm27BuildRun } from '../utils/fm27BuildMemory';
import type { DecodeTarget } from '../utils/decodeTarget';
import type {
  FmImportScope,
  FmSaveProgressStage,
  UploadController,
} from '../services/fmSaveReader';
import { compressImageFile } from './../utils/imageCompression';
import type { AnalystDispatch, AttachedFmFile } from './useAnalystDispatch';

export interface UploadedImage {
  base64: string;
  mimeType: string;
  name: string;
}

export interface FmFileIngestOptions {
  cancelDecodeRef: React.MutableRefObject<(() => void) | null>;
  decodeTarget: DecodeTarget;
  dispatchToAnalyst: AnalystDispatch;
  getLatestJourneyReportAsync?: () => Promise<DeepJourneyReport | null>;
  fastSync: boolean;
  importScope: FmImportScope;
  isDeviceOnline: boolean;
  latestJourneyReport?: DeepJourneyReport | null;
  messageInput: string;
  onBackgroundSyncStatusChange?: (
    status: {
      label: string;
      clubCoreReady: boolean;
      progressPct?: number;
      paused?: boolean;
    } | null
  ) => void;
  onApplyDecodedFmSave?: (
    decoded: DecodedFmSavePayload,
    options?: { isInterimCheckpoint?: boolean; benchmarkId?: string }
  ) => Promise<HydratedSaveState> | HydratedSaveState;
  onBulkMergePlayers?: (parsedPlayers: ParsedPlayerDelta[]) => Promise<SquadMergeResult> | SquadMergeResult;
  onUpdateSaveDate?: (date: string) => void;
  setAttachedFmFiles: React.Dispatch<React.SetStateAction<AttachedFmFile[]>>;
  setCacheHitNotice: React.Dispatch<React.SetStateAction<string | null>>;
  setChatError: React.Dispatch<React.SetStateAction<string | null>>;
  setChatFallbackNotice: React.Dispatch<React.SetStateAction<string | null>>;
  setClubCoreReadyDuringDecode: React.Dispatch<React.SetStateAction<boolean>>;
  setExtractionWarnings: React.Dispatch<React.SetStateAction<string[]>>;
  setFmDecodeStage: React.Dispatch<React.SetStateAction<FmSaveProgressStage | null>>;
  setLastStepTimingsMs: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  setOfflineServerRouteFile: React.Dispatch<React.SetStateAction<File | null>>;
  setUploadedImages: React.Dispatch<React.SetStateAction<UploadedImage[]>>;
  uploadControlRef: React.MutableRefObject<UploadController | null>;
}

export type ProcessIncomingFiles = (
  files: File[],
  options?: { forceLocal?: boolean }
) => Promise<void>;

export function useFmFileIngest(options: FmFileIngestOptions): ProcessIncomingFiles {
  const {
    cancelDecodeRef,
    decodeTarget,
    dispatchToAnalyst,
    getLatestJourneyReportAsync,
    fastSync,
    importScope,
    isDeviceOnline,
    latestJourneyReport,
    messageInput,
    onApplyDecodedFmSave,
    onBackgroundSyncStatusChange,
    onBulkMergePlayers,
    onUpdateSaveDate,
    setAttachedFmFiles,
    setCacheHitNotice,
    setChatError,
    setChatFallbackNotice,
    setClubCoreReadyDuringDecode,
    setExtractionWarnings,
    setFmDecodeStage,
    setLastStepTimingsMs,
    setOfflineServerRouteFile,
    setUploadedImages,
    uploadControlRef,
  } = options;

  return async (files: File[], options: { forceLocal?: boolean } = {}) => {
    if (files.length === 0) return;
    setChatError(null);
    setChatFallbackNotice(null);
    setOfflineServerRouteFile(null);
    const routeTarget: DecodeTarget = options.forceLocal ? 'local' : decodeTarget;

    for (const file of files) {
      const lower = file.name.toLowerCase();

      if (lower.endsWith('.fm')) {
        // Uploading to a server that cannot be reached used to end in "this is
        // not a valid save", which sends the user to fix a file that is fine.
        if (routeTarget === 'server' && !isDeviceOnline) {
          setOfflineServerRouteFile(file);
          setChatError(
            `You're offline, so the server backup can't be reached and ${file.name} was not uploaded. Decode it on this device instead.`
          );
          continue;
        }
        const benchmarkId = startSaveLoadBenchmark({
          fileName: file.name,
          fileSizeBytes: file.size,
          mode: fastSync ? 'fast' : 'full',
        });
        try {
          setExtractionWarnings([]);
          setLastStepTimingsMs({});
          setCacheHitNotice(null);
          setClubCoreReadyDuringDecode(false);
          let interimHydrated = false;
          let markedDecodeStart = false;
          const { decodeFmSaveFile, cancelFmSaveDecode, createUploadController } =
            await import('../services/fmSaveReader');
          cancelDecodeRef.current = cancelFmSaveDecode;
          const uploadControl = createUploadController();
          uploadControlRef.current = uploadControl;
          const initialLabel = `Reading ${file.name}${fastSync ? ' (Fast Sync)' : ''}…`;
          setFmDecodeStage({
            stage: 'read',
            step: 'Preparing .fm Save',
            progressPct: 0,
            totalBytes: file.size || 0,
            bytesUploaded: 0,
            label: initialLabel,
          });
          onBackgroundSyncStatusChange?.({
            label: initialLabel,
            clubCoreReady: false,
            progressPct: 0,
            paused: false,
          });

          let fingerprint: string | null = null;
          let decoded: DecodedFmSavePayload | null = null;
          const fingerprintStartedAt = performance.now();
          try {
            const [{ computeSaveFileFingerprint }, { getCachedDecodedSavePayload }] =
              await Promise.all([
                import('../utils/saveFileFingerprint'),
                import('../services/saveCache'),
              ]);
            fingerprint = await computeSaveFileFingerprint(file);
            recordSaveLoadDetails(benchmarkId, {
              fingerprintMs: performance.now() - fingerprintStartedAt,
            });
            if (fingerprint) {
              const cached = await getCachedDecodedSavePayload<DecodedFmSavePayload>(
                fingerprint,
                importScope,
                fastSync
              );
              if (
                cached &&
                isDecodedCacheSyncModeCompatible(cached.meta?.fastSync, fastSync)
              ) {
                decoded = assertValidDecodedFmSavePayload(cached);
                markSaveLoadCacheHit(benchmarkId);
                markSaveLoadStage(benchmarkId, 'upload_complete');
                markSaveLoadStage(benchmarkId, 'decode_start');
                markSaveLoadStage(benchmarkId, 'decode_complete');
                setFmDecodeStage({
                  stage: 'read',
                  step: 'Local cache hit',
                  progressPct: 100,
                  totalBytes: file.size || 0,
                  bytesUploaded: file.size || 0,
                  label: 'Reusing the saved decode from this device — no .fm decode needed.',
                });
                onBackgroundSyncStatusChange?.({
                  label: 'Reusing saved decode from this device…',
                  clubCoreReady: true,
                  progressPct: 100,
                  paused: false,
                });
                setCacheHitNotice(
                  `${file.name} was already decoded on this device. Skipped the .fm decode.`
                );
              }
            }
          } catch (cacheErr) {
            console.warn('Save fingerprint cache lookup skipped:', cacheErr);
          }

          if (!decoded) {
            decoded = assertValidDecodedFmSavePayload(
              await decodeFmSaveFile(
                file,
                (stage) => {
                  const uploadFinished =
                    stage.transport === 'server_decode' ||
                    stage.transport === 'browser_worker' ||
                    (stage.transport === 'server_upload' &&
                      Boolean(stage.totalBytes) &&
                      Number(stage.bytesUploaded || 0) >= Number(stage.totalBytes));
                  if (!markedDecodeStart && uploadFinished) {
                    markedDecodeStart = true;
                    markSaveLoadStage(benchmarkId, 'upload_complete');
                    markSaveLoadStage(benchmarkId, 'decode_start');
                  }
                  setFmDecodeStage(stage);
                  onBackgroundSyncStatusChange?.({
                    label: stage.label,
                    clubCoreReady: interimHydrated,
                    progressPct: stage.progressPct,
                    paused: stage.paused,
                  });
                },
                {
                  scope: importScope,
                  fastSync,
                  uploadControl,
                  benchmarkId,
                  forceBrowserWorker: routeTarget === 'local',
                  onCheckpoint: (cp) => {
                    let checkpointPayload: DecodedFmSavePayload;
                    try {
                      checkpointPayload = assertValidDecodedFmSavePayload(cp.payload, {
                        mode: 'checkpoint',
                      });
                    } catch {
                      return;
                    }
                    if (onApplyDecodedFmSave && checkpointPayload.players.length > 0) {
                      interimHydrated = true;
                      setClubCoreReadyDuringDecode(true);
                      void onApplyDecodedFmSave(checkpointPayload, {
                        isInterimCheckpoint: true,
                        benchmarkId,
                      });
                      onBackgroundSyncStatusChange?.({
                        label: 'Squad, staff, finances & tactics ready',
                        clubCoreReady: true,
                      });
                    }
                  },
                }
              )
            );
            markSaveLoadStage(benchmarkId, 'decode_complete');

            const decodedPayload = decoded;
            if (fingerprint) {
              void import('../services/saveCache')
                .then(({ putCachedDecodedSavePayload }) =>
                  putCachedDecodedSavePayload(
                    fingerprint,
                    importScope,
                    resolveDecodedPayloadFastSync(
                      decodedPayload.meta?.fastSync,
                      fastSync
                    ),
                    decodedPayload
                  )
                )
                .catch(() => false);
            }
          }

          uploadControlRef.current = null;
          setFmDecodeStage(null);
          setClubCoreReadyDuringDecode(false);

          const nonFatalWarnings = Array.from(
            new Set([
              ...(Array.isArray(decoded.extractionWarnings)
                ? decoded.extractionWarnings
                : []),
              ...(Array.isArray(decoded.warnings) ? decoded.warnings : []),
            ])
          );
          setExtractionWarnings(nonFatalWarnings);
          setLastStepTimingsMs(
            decoded.stepTimingsMs && typeof decoded.stepTimingsMs === 'object'
              ? decoded.stepTimingsMs
              : {}
          );

          markSaveLoadStage(benchmarkId, 'hydrate_start');
          const hydrated = onApplyDecodedFmSave
            ? await onApplyDecodedFmSave(decoded, {
                isInterimCheckpoint: false,
                benchmarkId,
              })
            : undefined;
          markSaveLoadStage(benchmarkId, 'hydrate_complete');
          recordFm27BuildRun(decoded);
          onBackgroundSyncStatusChange?.(null);

          // Wait for snapshot persistence & Save-to-Save Journey diff BEFORE dispatching to Analyst
          const freshJourney = getLatestJourneyReportAsync
            ? await getLatestJourneyReportAsync()
            : latestJourneyReport;

          const decodedEntry: AttachedFmFile = {
            id: `fm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            name: file.name,
            kind: 'FM_SAVE_DECODED',
            badgeLabel: `${file.name} (${decoded.meta.clubName} · ${decoded.meta.gameDateDmy || 'Decoded'})`,
            promptContext:
              hydrated?.analystPromptContext || JSON.stringify(decoded.meta),
            hydratedSave: hydrated,
          };

          if (!messageInput.trim()) {
            const syncPrompt = freshJourney
              ? `I just imported my live .fm save file ${file.name} (${decoded.meta.clubName} · ${decoded.meta.gameDateDmy || 'Live'}). Compare this save against my previous checkpoint (${freshJourney.fromDate} [${freshJourney.fromSeason}] -> ${freshJourney.toDate} [${freshJourney.toSeason}]) — summarize my Save-to-Save Career Journey (what improved, what worsened, League vs Cup vs Friendlies progression separately, squad/finances, governance/promises) and give me our next-match plan.`
              : `I just imported my live .fm save file ${file.name} (${decoded.meta.clubName} · ${decoded.meta.gameDateDmy || 'Live'}). Give me a concise tactical audit of our squad, League vs Cup vs Friendlies results separately, finances, governance/promises, and next-match plan.`;
            await dispatchToAnalyst({
              promptText: syncPrompt,
              imagesToSend: [],
              fmFilesToSend: [decodedEntry],
              journeyReportOverride: freshJourney,
            });
          } else {
            setAttachedFmFiles((prev) => [...prev, decodedEntry]);
          }
        } catch (err: unknown) {
          markSaveLoadStage(benchmarkId, 'failed');
          finishSaveLoadBenchmark(benchmarkId);
          uploadControlRef.current = null;
          setFmDecodeStage(null);
          setClubCoreReadyDuringDecode(false);
          onBackgroundSyncStatusChange?.(null);
          if (err instanceof Error && err.message === 'CANCELLED_BY_USER') {
            return;
          }
          setChatError(
            err instanceof Error
              ? err.message
              : `Could not read ${file.name}. Check it is a Football Manager 27 (or 26) save, then try again. If the game is still saving, wait for it to finish and import the file once more.`
          );
        }
      } else if (
        lower.endsWith('.csv') ||
        lower.endsWith('.html') ||
        lower.endsWith('.htm') ||
        lower.endsWith('.rtf') ||
        lower.endsWith('.txt')
      ) {
        try {
          const [text, { parseFmStructuredExport }] = await Promise.all([
            file.text(),
            import('../utils/fmFileImporter'),
          ]);
          const parsed = parseFmStructuredExport(text, file.name);
          const initialMergeResult =
            parsed.parsedPlayers.length > 0 && onBulkMergePlayers
              ? await onBulkMergePlayers(parsed.parsedPlayers)
              : undefined;
          if (parsed.detectedDate && onUpdateSaveDate) {
            onUpdateSaveDate(parsed.detectedDate);
          }
          const countDesc =
            parsed.parsedPlayers.length > 0
              ? `${parsed.parsedPlayers.length} players synced`
              : `${parsed.rowCount} rows parsed`;

          setAttachedFmFiles((prev) => [
            ...prev,
            {
              id: `exp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              name: file.name,
              kind: 'FM_EXPORT',
              badgeLabel: `${file.name} (${countDesc})`,
              promptContext: parsed.promptContext,
              parsedExport: parsed,
              initialMergeResult,
            },
          ]);
        } catch {
          setChatError(`Could not parse ${file.name}.`);
        }
      } else if (file.type.startsWith('image/')) {
        try {
          const compressed = await compressImageFile(file);
          if (compressed.base64) {
            setUploadedImages((prev) => [...prev, compressed]);
          }
        } catch {
          setChatError(`Could not read image ${file.name}.`);
        }
      } else {
        setChatError(
          `Unsupported file "${file.name}". Drop a .fm save file or screenshot image.`
        );
      }
    }
  };
}
