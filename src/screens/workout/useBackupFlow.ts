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
  serializePearLiftBackupV3,
  toPearLiftBackupV3,
} from '@/backup/localBackup';
import {
  assembleChunkedPackets,
  decodeQrPayload,
} from '@/backup/qrBackupCodec';
import { applyWorkoutMutation, showPrompt } from '@/screens/workout/services';
import { useImportStore } from '@/store/importStore';
import { useWorkoutDataStore } from '@/store/workoutDataStore';
import { useWorkoutUiStore } from '@/store/workoutUiStore';
import { getErrorMessage, logError } from '@/utils/errors';

export function useBackupFlow() {
  const { t } = useTranslation();
  const snapshot = useWorkoutDataStore((state) => state.snapshot);
  const ui = useWorkoutUiStore();
  const importStore = useImportStore();
  const [shareToDeviceOpen, setShareToDeviceOpen] = useState(false);
  const [scanFromDeviceOpen, setScanFromDeviceOpen] = useState(false);
  const [backupActionMode, setBackupActionMode] = useState<
    'local' | 'qr' | null
  >(null);

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

      importStore.setPendingImport(migrated);
      importStore.setImportSummary(summary);
      ui.setImportPreviewOpen(true);
      return true;
    } catch (error) {
      logError('backup/import from payload failed', error);
      showPrompt(t('prompts.importBackup.failedTitle'), getErrorMessage(error));
      return false;
    }
  };

  return {
    shareToDeviceOpen,
    scanFromDeviceOpen,
    backupActionMode,
    setShareToDeviceOpen,
    setScanFromDeviceOpen,
    setBackupActionMode,
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
        const payload = serializePearLiftBackupV3(snapshot);

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
    handleConfirmImport: async () => {
      if (!importStore.pendingImport) return;
      try {
        await applyWorkoutMutation({
          type: 'restoreRuntimeState',
          runtime: importStore.pendingImport.runtime,
          source: 'local-import',
        });
        ui.setImportPreviewOpen(false);
        importStore.setPendingImport(null);
      } catch (error) {
        logError('backup/import confirm failed', error);
        showPrompt(
          t('prompts.importBackup.failedTitle'),
          getErrorMessage(error),
        );
      }
    },
    handleCancelImport: () => {
      ui.setImportPreviewOpen(false);
      importStore.setPendingImport(null);
    },
  };
}
