import { MaterialIcons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ThemeTokens } from '../theme/tokens';

interface LocalBackupModalProps {
  open: boolean;
  tokens: ThemeTokens;
  onClose: () => void;
  onExport: () => void;
  onImport: () => void;
}

export function LocalBackupModal({
  open,
  tokens,
  onClose,
  onExport,
  onImport,
}: LocalBackupModalProps) {
  const styles = useMemo(() => createStyles(tokens), [tokens]);

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
            <Text style={styles.title}>Local Backup</Text>
            <Pressable style={styles.closeButton} onPress={onClose}>
              <MaterialIcons
                name="close"
                size={18}
                color={tokens.colors.textSecondary}
              />
            </Pressable>
          </View>

          <Text style={styles.message}>
            Export your workout data to a JSON file or import from a previously
            saved backup.
          </Text>

          <View style={styles.actions}>
            <Pressable style={styles.actionButton} onPress={onExport}>
              <MaterialIcons
                name="download"
                size={18}
                color={tokens.colors.onPrimary}
              />
              <Text style={styles.actionText}>Export Backup</Text>
            </Pressable>
            <Pressable style={styles.actionButton} onPress={onImport}>
              <MaterialIcons
                name="upload"
                size={18}
                color={tokens.colors.onPrimary}
              />
              <Text style={styles.actionText}>Import Backup</Text>
            </Pressable>
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
      maxWidth: 480,
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
    message: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.body,
      lineHeight: 20,
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
    actionText: {
      color: tokens.colors.onPrimary,
      fontSize: tokens.type.body,
      fontWeight: '700',
    },
  });
}
