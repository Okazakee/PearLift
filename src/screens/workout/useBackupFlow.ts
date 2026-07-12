import { File, Paths } from 'expo-file-system';
import {
  EncodingType,
  StorageAccessFramework,
  writeAsStringAsync,
} from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  computeImportDiff,
  getBackupFileName,
  parseAndMigrateBackup,
  prepareImportRuntime,
  serializePearLiftBackupCollection,
  toPearLiftBackupV3,
} from '@/backup/localBackup';
import {
  assembleChunkedPackets,
  decodeQrPayload,
} from '@/backup/qrBackupCodec';
import type {
  BackupProgramCollection,
  ChangeSummary,
  MigratedBackupResult,
} from '@/backup/types';
import {
  getBackupProgramCollection,
  importProgram,
  showPrompt,
} from '@/screens/workout/services';
import { useWorkoutDataStore } from '@/store/workoutDataStore';
import { getErrorMessage, logError } from '@/utils/errors';

const EMPTY_IMPORT_SUMMARY: ChangeSummary = {
  programName: 'Imported Program',
  workouts: [],
  matchingExercises: [],
  changedExercises: [],
  newExercises: [],
  removedExercises: [],
  preservedWeights: [],
  missingWeightExercises: [],
  programMetadata: [],
  settings: [],
  weekConfigs: [],
  dayConfigs: [],
  incomingWorkoutCount: 0,
  incomingExerciseCount: 0,
  totalChanges: 0,
};

export function useBackupFlow() {
  const { t } = useTranslation();
  const snapshot = useWorkoutDataStore((state) => state.snapshot);
  const [shareToDeviceOpen, setShareToDeviceOpen] = useState(false);
  const [shareTransferCollection, setShareTransferCollection] =
    useState<BackupProgramCollection | null>(null);
  const [scanFromDeviceOpen, setScanFromDeviceOpen] = useState(false);
  const [pendingImport, setPendingImport] =
    useState<MigratedBackupResult | null>(null);
  const [importSummary, setImportSummary] =
    useState<ChangeSummary>(EMPTY_IMPORT_SUMMARY);
  const [importPreviewOpen, setImportPreviewOpen] = useState(false);
  const [backupActionMode, setBackupActionMode] = useState<
    'local' | 'qr' | null
  >(null);

  const applyPendingImport = async (
    mode: 'import_as_new' | 'replace_active',
  ) => {
    if (!pendingImport) return;
    try {
      const activeProgramId =
        pendingImport.collection.activeProgramId ??
        pendingImport.collection.programs[0]?.program.id ??
        pendingImport.runtime.program?.id ??
        null;
      const inactivePrograms = pendingImport.collection.programs.filter(
        (programState) => programState.program.id !== activeProgramId,
      );

      if (mode === 'replace_active') {
        await importProgram({
          runtime: pendingImport.runtime,
          sessionLogs: pendingImport.sessionLogs,
          mode,
          activate: true,
        });
      } else {
        for (const programState of inactivePrograms) {
          await importProgram({
            runtime: programState,
            sessionLogs: programState.sessionLogs,
            mode: 'import_as_new',
            activate: false,
          });
        }

        const activeProgramState =
          pendingImport.collection.programs.find(
            (programState) => programState.program.id === activeProgramId,
          ) ?? pendingImport.collection.programs[0];
        if (activeProgramState) {
          await importProgram({
            runtime: activeProgramState,
            sessionLogs: activeProgramState.sessionLogs,
            mode: 'import_as_new',
            activate: true,
          });
        }
      }

      if (mode === 'replace_active') {
        for (const programState of inactivePrograms) {
          await importProgram({
            runtime: programState,
            sessionLogs: programState.sessionLogs,
            mode: 'import_as_new',
            activate: false,
          });
        }
      }

      setImportPreviewOpen(false);
      setPendingImport(null);
      setImportSummary(EMPTY_IMPORT_SUMMARY);
    } catch (error) {
      logError('backup/import confirm failed', error);
      showPrompt(t('prompts.importBackup.failedTitle'), getErrorMessage(error));
    }
  };

  const beginImportFromPayload = async (payload: string) => {
    if (!snapshot) return false;
    try {
      let decodedPayload = payload;
      const qrDecoded = decodeQrPayload(payload);
      if (qrDecoded.kind === 'single') {
        decodedPayload = assembleChunkedPackets(
          new Map([[0, qrDecoded.payload]]),
          1,
          qrDecoded.checksum,
        );
      } else if (qrDecoded.kind === 'chunk') {
        decodedPayload = assembleChunkedPackets(
          new Map([[qrDecoded.index, qrDecoded.payload]]),
          qrDecoded.total,
          qrDecoded.checksum,
        );
      } else {
        decodedPayload = qrDecoded.payload;
      }

      const migrated = parseAndMigrateBackup(decodedPayload);
      const summary = computeImportDiff(
        toPearLiftBackupV3(snapshot),
        migrated.backup,
      );
      const runtime = prepareImportRuntime(snapshot, migrated.runtime);

      setPendingImport({
        ...migrated,
        runtime,
      });
      setImportSummary(summary);
      setImportPreviewOpen(true);
      return true;
    } catch (error) {
      logError('backup/import from payload failed', error);
      showPrompt(t('prompts.importBackup.failedTitle'), getErrorMessage(error));
      return false;
    }
  };

  return {
    shareToDeviceOpen,
    shareTransferCollection,
    scanFromDeviceOpen,
    importSummary,
    importPreviewOpen,
    backupActionMode,
    setScanFromDeviceOpen,
    setBackupActionMode,
    handleOpenShareToDevice: async () => {
      if (!snapshot) return;
      try {
        const collection = await getBackupProgramCollection();
        setShareTransferCollection(collection);
        setShareToDeviceOpen(true);
      } catch (error) {
        logError('backup/qr-export prepare failed', error);
        showPrompt(
          t('prompts.exportBackup.failedTitle'),
          getErrorMessage(error),
        );
      }
    },
    handleCloseShareToDevice: () => {
      setShareToDeviceOpen(false);
      setShareTransferCollection(null);
    },
    handleOpenLocalBackup: () => {
      setBackupActionMode('local');
    },
    handleOpenQRBackup: () => {
      setBackupActionMode('qr');
    },
    exportBackup: async (mode: 'share' | 'save') => {
      if (!snapshot) return;
      try {
        const fileName = getBackupFileName();
        const collection = await getBackupProgramCollection();
        const payload = serializePearLiftBackupCollection(collection);

        if (mode === 'save') {
          const permissions =
            await StorageAccessFramework.requestDirectoryPermissionsAsync();
          if (!permissions.granted) {
            logError('backup/export save canceled', {
              reason: 'directory-permission-denied',
            });
            return;
          }

          const targetUri = await StorageAccessFramework.createFileAsync(
            permissions.directoryUri,
            fileName,
            'application/json',
          );

          await writeAsStringAsync(targetUri, payload, {
            encoding: EncodingType.UTF8,
          });

          showPrompt(
            t('prompts.exportBackup.savedTitle'),
            t('prompts.exportBackup.savedMessage', { fileName }),
          );
          return;
        }

        const file = new File(Paths.cache, fileName);
        file.create({ overwrite: true, intermediates: true });
        file.write(payload, { encoding: 'utf8' });

        if (await Sharing.isAvailableAsync()) {
          try {
            await Sharing.shareAsync(file.uri, {
              mimeType: 'application/json',
              dialogTitle: t('prompts.exportBackup.chooserTitle'),
              UTI: 'public.json',
            });
          } catch (error) {
            const message = getErrorMessage(error).toLowerCase();
            if (!message.includes('cancel')) {
              logError('backup/export share failed', {
                mode,
                fileName,
                error: getErrorMessage(error),
              });
              throw error;
            }
            logError('backup/export share canceled', {
              mode,
              fileName,
            });
          }
        } else {
          logError('backup/export share unavailable', {
            mode,
            platform: 'android',
          });
          showPrompt(
            t('prompts.exportBackup.sharingUnavailableTitle'),
            t('prompts.exportBackup.sharingUnavailableMessage'),
          );
        }
      } catch (error) {
        logError('backup/export failed', error);
        showPrompt(
          t('prompts.exportBackup.failedTitle'),
          getErrorMessage(error),
        );
      }
    },
    handleImportBackup: async () => {
      if (!snapshot) return;
      try {
        const picked = await File.pickFileAsync(undefined, 'application/json');
        const pickedFile = Array.isArray(picked) ? picked[0] : picked;
        if (!pickedFile) return;

        const fileText = await pickedFile.text();
        void beginImportFromPayload(fileText);
      } catch (error) {
        const message = getErrorMessage(error).toLowerCase();
        if (message.includes('cancel')) return;
        logError('backup/import failed', error);
        showPrompt(
          t('prompts.importBackup.failedTitle'),
          getErrorMessage(error),
        );
      }
    },
    handleScanPayload: async (payload: string) =>
      beginImportFromPayload(payload),
    handleImportAsNewProgram: async () => {
      if (!pendingImport) return;
      await applyPendingImport('import_as_new');
    },
    handleReplaceActiveProgram: async () => {
      if (!pendingImport) return;
      showPrompt(
        t('prompts.importBackup.confirmReplaceTitle'),
        t('prompts.importBackup.confirmReplaceMessage', {
          program: importSummary.programName,
        }),
        [
          {
            label: t('common.cancel'),
            tone: 'cancel',
          },
          {
            label: t('prompts.importBackup.confirmReplaceAction'),
            tone: 'destructive',
            onPress: () => {
              void applyPendingImport('replace_active');
            },
          },
        ],
      );
    },
    handleCancelImport: () => {
      setImportPreviewOpen(false);
      setPendingImport(null);
      setImportSummary(EMPTY_IMPORT_SUMMARY);
    },
  };
}
