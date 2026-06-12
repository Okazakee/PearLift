import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState } from 'react-native';
import { getWorkoutRuntime } from '@/screens/workout/runtime';
import {
  forgetPairedDevice,
  leaveSyncRoom,
  refreshSyncLogs,
  refreshSyncState,
  renameLocalDevice,
  resolveFirstSyncChoice,
  showPrompt,
  startSync,
  stopSync,
} from '@/screens/workout/services';
import { useSyncStore } from '@/store/syncStore';
import { useWorkoutDataStore } from '@/store/workoutDataStore';
import { summarizeRuntime } from '@/sync/firstSync';
import { clearRecentLogs } from '@/sync/logger';
import { decodeSyncRoomInvite, encodeSyncRoomInvite } from '@/sync/roomInvite';
import {
  getPairingSecretPayload,
  setPairingSecretPayload,
} from '@/sync/syncManager';
import { getErrorMessage } from '@/utils/errors';

export function useSyncFlow(input: {
  settingsOpen: boolean;
  syncDebugOpen: boolean;
}) {
  const { t } = useTranslation();
  const snapshot = useWorkoutDataStore((state) => state.snapshot);
  const syncStore = useSyncStore();
  const { settingsOpen, syncDebugOpen } = input;
  const [syncMasterKey, setSyncMasterKey] = useState<string | null>(null);
  const [syncRoomInvite, setSyncRoomInvite] = useState<string | null>(null);
  const [createRoomStarting, setCreateRoomStarting] = useState(false);
  const [createRoomOpen, setCreateRoomOpen] = useState(false);
  const [joinRoomOpen, setJoinRoomOpen] = useState(false);
  const [joinRoomScanOpen, setJoinRoomScanOpen] = useState(false);
  const [syncQuickInfoOpen, setSyncQuickInfoOpen] = useState(false);
  const [settingsSyncExpanded, setSettingsSyncExpanded] = useState(false);

  useEffect(() => {
    if (!settingsOpen) return;
    void (async () => {
      try {
        const key = await getPairingSecretPayload();
        setSyncMasterKey(key);
      } catch {
        setSyncMasterKey(null);
      }
    })();
  }, [settingsOpen]);

  useEffect(() => {
    if (!syncDebugOpen) return;
    void refreshSyncLogs();
  }, [syncDebugOpen]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') return;
      const currentSyncStore = useSyncStore.getState();
      if (!currentSyncStore.syncState?.syncEnabled) return;
      const hasLiveConnection = currentSyncStore.syncHealth.connections > 0;
      const status = currentSyncStore.syncHealth.status;
      const isHealthyForegroundState =
        hasLiveConnection &&
        (status === 'handshake_ok' ||
          status === 'synced' ||
          status === 'peer_connected' ||
          status === 'replicating');

      if (
        isHealthyForegroundState &&
        currentSyncStore.syncHealth.reconnectAttempts <= 0
      ) {
        return;
      }

      void (async () => {
        try {
          await refreshSyncState();
          await refreshSyncLogs();
          const key = syncMasterKey ?? (await getPairingSecretPayload());
          setSyncMasterKey(key);
          await stopSync();
          await startSync(
            currentSyncStore.syncState?.syncRole ?? 'creator',
            key,
          );
        } catch {
          // ignore foreground reconnect nudges
        }
      })();
    });

    return () => {
      sub.remove();
    };
  }, [syncMasterKey]);

  const localSyncSummary = snapshot ? summarizeRuntime(snapshot) : null;

  const startCreatorRoom = async (forcedKey?: string) => {
    const { repository } = getWorkoutRuntime();
    const wasActive = syncStore.syncState?.syncEnabled ?? false;
    if (wasActive) {
      await stopSync();
    }

    const key = (
      forcedKey ??
      syncMasterKey ??
      (await getPairingSecretPayload())
    )
      .trim()
      .toLowerCase();
    await repository.clearSyncPeerHistory();
    await setPairingSecretPayload(key);
    setSyncMasterKey(key);
    await refreshSyncState();
    await startSync('creator', key);
    const nextSyncState = await repository.getSyncState();
    if (!nextSyncState.autobaseBootstrapKey) {
      throw new Error('Sync room bootstrap key was not created.');
    }
    setSyncRoomInvite(
      encodeSyncRoomInvite({
        pairingSecretHex: key,
        bootstrapKeyHex: nextSyncState.autobaseBootstrapKey,
      }),
    );
    setJoinRoomOpen(false);
  };

  return {
    syncMasterKey,
    syncRoomInvite,
    createRoomStarting,
    createRoomOpen,
    joinRoomOpen,
    joinRoomScanOpen,
    syncQuickInfoOpen,
    settingsSyncExpanded,
    localSyncSummary,
    setCreateRoomOpen,
    setJoinRoomOpen,
    setJoinRoomScanOpen,
    setSyncQuickInfoOpen,
    setSettingsSyncExpanded,
    handleToggleSync: async (nextEnabled: boolean) => {
      if (nextEnabled) {
        const existingKey = syncMasterKey ?? (await getPairingSecretPayload());
        const role = syncStore.syncState?.syncRole;
        setSyncMasterKey(existingKey);

        if (!role) {
          await (async () => {
            const key = syncMasterKey ?? (await getPairingSecretPayload());
            setSyncMasterKey(key);
            setSyncRoomInvite(null);
            setCreateRoomOpen(true);

            if (syncStore.syncState?.autobaseBootstrapKey) {
              setSyncRoomInvite(
                encodeSyncRoomInvite({
                  pairingSecretHex: key,
                  bootstrapKeyHex: syncStore.syncState.autobaseBootstrapKey,
                }),
              );
              return;
            }

            setCreateRoomStarting(true);
            try {
              await startCreatorRoom(key);
            } finally {
              setCreateRoomStarting(false);
            }
          })();
          return;
        }

        if (role === 'joiner' && !existingKey.trim()) {
          setJoinRoomOpen(true);
          return;
        }

        await startSync(role, existingKey);
        return;
      }

      await stopSync();
    },
    handleApplyMasterKey: async (nextKey: string) => {
      const { repository } = getWorkoutRuntime();
      const normalized = nextKey.trim().toLowerCase();
      const wasActive = syncStore.syncState?.syncEnabled ?? false;
      if (wasActive) {
        await stopSync();
      }
      await repository.clearSyncPeerHistory();
      await setPairingSecretPayload(normalized);
      await repository.setSyncState({ autobaseBootstrapKey: null });
      setSyncMasterKey(normalized);
      await refreshSyncState();
      if (wasActive) {
        await startSync(syncStore.syncState?.syncRole ?? 'joiner', normalized);
      }
    },
    handleCopyMasterKey: async () => {
      const key = syncMasterKey ?? (await getPairingSecretPayload());
      setSyncMasterKey(key);
      await Clipboard.setStringAsync(key);
    },
    handleRefreshSync: async () => {
      await refreshSyncState();
      await refreshSyncLogs();
      try {
        const key = await getPairingSecretPayload();
        setSyncMasterKey(key);
      } catch {
        setSyncMasterKey(null);
      }
    },
    handleOpenCreateRoom: async () => {
      const key = syncMasterKey ?? (await getPairingSecretPayload());
      setSyncMasterKey(key);
      setSyncRoomInvite(null);
      setCreateRoomOpen(true);

      if (syncStore.syncState?.autobaseBootstrapKey) {
        setSyncRoomInvite(
          encodeSyncRoomInvite({
            pairingSecretHex: key,
            bootstrapKeyHex: syncStore.syncState.autobaseBootstrapKey,
          }),
        );
        return;
      }

      setCreateRoomStarting(true);
      try {
        await startCreatorRoom(key);
      } finally {
        setCreateRoomStarting(false);
      }
    },
    handleJoinRoom: async (nextKey: string, showError = true) => {
      try {
        const { repository } = getWorkoutRuntime();
        const invite = decodeSyncRoomInvite(nextKey);
        const wasActive = syncStore.syncState?.syncEnabled ?? false;
        if (wasActive) {
          await stopSync();
        }

        await repository.clearSyncPeerHistory();
        await setPairingSecretPayload(invite.pairingSecretHex);
        setSyncMasterKey(invite.pairingSecretHex);
        await repository.setSyncState({
          autobaseBootstrapKey: invite.bootstrapKeyHex,
        });
        await refreshSyncState();
        await startSync(
          'joiner',
          invite.pairingSecretHex,
          invite.bootstrapKeyHex,
        );
        setJoinRoomOpen(false);
        setJoinRoomScanOpen(false);
        setCreateRoomOpen(false);
        return true;
      } catch (error) {
        if (showError) {
          showPrompt(t('sync.join.invalidKey'), getErrorMessage(error));
        }
        return false;
      }
    },
    handleResolveFirstSyncDecision: async (
      choice: 'local_chosen' | 'remote_chosen' | 'merge_chosen',
    ) => {
      await resolveFirstSyncChoice(choice);
    },
    handleForgetPairedDevice: (deviceId: string) => {
      showPrompt(
        t('sync.manage.removeDeviceConfirmTitle'),
        t('sync.manage.removeDeviceConfirmMessage'),
        [
          { label: t('common.cancel'), tone: 'cancel' },
          {
            label: t('sync.manage.removeDevice'),
            tone: 'destructive',
            onPress: () => {
              void forgetPairedDevice(deviceId);
            },
          },
        ],
      );
    },
    handleLeaveSyncRoom: () => {
      showPrompt(
        t('sync.manage.leaveRoomConfirmTitle'),
        t('sync.manage.leaveRoomConfirmMessage'),
        [
          { label: t('common.cancel'), tone: 'cancel' },
          {
            label: t('sync.manage.leaveRoom'),
            tone: 'destructive',
            onPress: () => {
              void leaveSyncRoom();
            },
          },
        ],
      );
    },
    handleShowSyncQRCode: async () => {
      if (!syncStore.syncState?.autobaseBootstrapKey) return;
      const key = syncMasterKey ?? (await getPairingSecretPayload());
      setSyncMasterKey(key);
      setSyncRoomInvite(
        encodeSyncRoomInvite({
          pairingSecretHex: key,
          bootstrapKeyHex: syncStore.syncState.autobaseBootstrapKey,
        }),
      );
      setCreateRoomOpen(true);
    },
    handleOnboardingOpenCreate: () => {
      void (async () => {
        const key = syncMasterKey ?? (await getPairingSecretPayload());
        setSyncMasterKey(key);
        setSyncRoomInvite(null);
        setCreateRoomOpen(true);
      })();
    },
    handleOnboardingOpenJoin: () => {
      setJoinRoomOpen(true);
    },
    renameLocalDevice,
    clearRecentLogs,
  };
}
