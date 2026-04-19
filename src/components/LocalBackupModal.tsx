import { Feather } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { SyncMode } from '../storage/types';
import type { ThemeTokens } from '../theme/tokens';
import { withAlpha } from '../theme/tokens';

interface LocalBackupModalProps {
  open: boolean;
  tokens: ThemeTokens;
  syncMode: SyncMode;
  syncSummary: string;
  busy: boolean;
  onClose: () => void;
  onExport: () => void;
  onImport: () => void;
  onOpenSyncSetup: () => void;
}

export function LocalBackupModal({
  open,
  tokens,
  syncMode,
  syncSummary,
  busy,
  onClose,
  onExport,
  onImport,
  onOpenSyncSetup,
}: LocalBackupModalProps) {
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const d2dEnabled = syncMode === 'd2d-sync';

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalRoot}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>Backup & Sync</Text>
            <Pressable style={styles.closeButton} onPress={onClose}>
              <Feather name="x" size={18} color={tokens.colors.textSecondary} />
            </Pressable>
          </View>

          {d2dEnabled ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Device Sync</Text>
              <Text style={styles.message}>
                Sync directly with another device using QR code pairing.
              </Text>
              <View style={styles.statusBanner}>
                <Feather
                  name="monitor"
                  size={18}
                  color={tokens.colors.primary}
                />
                <Text style={styles.statusText}>{syncSummary}</Text>
              </View>
              <View style={styles.actions}>
                <Pressable
                  style={[styles.actionButton, busy && styles.disabledButton]}
                  onPress={onOpenSyncSetup}
                  disabled={busy}
                >
                  <Feather
                    name="link"
                    size={18}
                    color={tokens.colors.onPrimary}
                  />
                  <Text style={styles.actionText}>Pair Device</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Device Sync</Text>
              <Text style={styles.message}>
                Device-to-device sync can be enabled in Sync Setup.
              </Text>
              <Pressable
                style={[styles.secondaryButton, busy && styles.disabledButton]}
                onPress={onOpenSyncSetup}
                disabled={busy}
              >
                <Feather
                  name="sliders"
                  size={18}
                  color={tokens.colors.primary}
                />
                <Text style={styles.secondaryText}>Enable in Sync Setup</Text>
              </Pressable>
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Local JSON</Text>
            <Text style={styles.message}>
              Export your workout data to a JSON file or import a previous local
              backup.
            </Text>
            <View style={styles.actions}>
              <Pressable
                style={[styles.actionButton, busy && styles.disabledButton]}
                onPress={onExport}
                disabled={busy}
              >
                <Feather
                  name="download"
                  size={18}
                  color={tokens.colors.onPrimary}
                />
                <Text style={styles.actionText}>Export Backup</Text>
              </Pressable>
              <Pressable
                style={[styles.actionButton, busy && styles.disabledButton]}
                onPress={onImport}
                disabled={busy}
              >
                <Feather
                  name="upload"
                  size={18}
                  color={tokens.colors.onPrimary}
                />
                <Text style={styles.actionText}>Import Backup</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(tokens: ThemeTokens) {
  return StyleSheet.create({
    modalRoot: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: tokens.spacing.lg,
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
    },
    card: {
      width: '100%',
      maxWidth: 520,
      borderRadius: tokens.radius.xl,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      backgroundColor: tokens.colors.surfaceContainer,
      padding: tokens.spacing.lg,
      gap: tokens.spacing.md,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    title: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.subtitle,
      fontWeight: '700',
    },
    closeButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      alignItems: 'center',
      justifyContent: 'center',
    },
    section: {
      gap: tokens.spacing.sm,
      padding: tokens.spacing.md,
      borderRadius: tokens.radius.lg,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      backgroundColor: withAlpha(tokens.colors.primary, 0.04),
    },
    sectionTitle: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.body,
      fontWeight: '700',
    },
    message: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.body,
      lineHeight: 20,
    },
    statusBanner: {
      flexDirection: 'row',
      gap: tokens.spacing.xs,
      alignItems: 'center',
      paddingHorizontal: tokens.spacing.sm,
      paddingVertical: tokens.spacing.sm,
      borderRadius: tokens.radius.md,
      backgroundColor: withAlpha(tokens.colors.primary, 0.1),
    },
    statusText: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.label,
      fontWeight: '600',
      flex: 1,
    },
    actions: {
      gap: tokens.spacing.sm,
    },
    actionButton: {
      borderRadius: tokens.radius.md,
      backgroundColor: tokens.colors.primary,
      minHeight: 44,
      paddingHorizontal: tokens.spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: tokens.spacing.xs,
    },
    secondaryButton: {
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: withAlpha(tokens.colors.primary, 0.35),
      backgroundColor: withAlpha(tokens.colors.primary, 0.08),
      minHeight: 44,
      paddingHorizontal: tokens.spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: tokens.spacing.xs,
    },
    disabledButton: {
      opacity: 0.55,
    },
    actionText: {
      color: tokens.colors.onPrimary,
      fontSize: tokens.type.body,
      fontWeight: '700',
    },
    secondaryText: {
      color: tokens.colors.primary,
      fontSize: tokens.type.body,
      fontWeight: '700',
    },
  });
}
