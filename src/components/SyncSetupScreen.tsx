import { MaterialIcons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { SyncMode } from '../storage/types';
import type { ThemeTokens } from '../theme/tokens';
import { withAlpha } from '../theme/tokens';

interface SyncSetupScreenProps {
  open: boolean;
  tokens: ThemeTokens;
  topInset: number;
  bottomInset: number;
  currentMode: SyncMode;
  busy: boolean;
  errorMessage: string | null;
  identityFingerprint: string | null;
  onClose: () => void;
  onSaveMode: (mode: SyncMode) => Promise<void>;
  onImportLocalBackup: () => Promise<void>;
  onRestoreRelayBackup: () => Promise<void>;
}

function modeTitle(mode: SyncMode) {
  if (mode === 'd2d-sync') return 'Device-to-Device sync';
  return 'Local only';
}

export function SyncSetupScreen({
  open,
  tokens,
  topInset,
  bottomInset,
  currentMode,
  busy,
  errorMessage,
  identityFingerprint,
  onClose,
  onSaveMode,
  onImportLocalBackup,
  onRestoreRelayBackup,
}: SyncSetupScreenProps) {
  const [selectedMode, setSelectedMode] = useState<SyncMode>(currentMode);
  const styles = useMemo(
    () => createStyles(tokens, topInset, bottomInset),
    [tokens, topInset, bottomInset],
  );

  const d2dEnabled = selectedMode === 'd2d-sync';

  return (
    <Modal visible={open} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={onClose}>
            <MaterialIcons
              name="arrow-back"
              size={22}
              color={tokens.colors.textPrimary}
            />
          </Pressable>
          <Text style={styles.title}>Sync Setup</Text>
          <View style={styles.backButton} />
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Mode</Text>
            <Text style={styles.sectionBody}>
              Choose how PearLift stores and recovers your data. You can switch
              modes without reinstalling.
            </Text>

            <Pressable
              style={[
                styles.modeCard,
                selectedMode === 'local-only' && styles.modeCardActive,
              ]}
              onPress={() => setSelectedMode('local-only')}
            >
              <MaterialIcons
                name="phone-android"
                size={18}
                color={tokens.colors.textPrimary}
              />
              <View style={styles.modeTextWrap}>
                <Text style={styles.modeTitle}>Local only</Text>
                <Text style={styles.modeBody}>
                  Keep data local and use JSON import/export manually.
                </Text>
              </View>
            </Pressable>

            <Pressable
              style={[
                styles.modeCard,
                selectedMode === 'd2d-sync' && styles.modeCardActive,
              ]}
              onPress={() => setSelectedMode('d2d-sync')}
            >
              <MaterialIcons
                name="devices"
                size={18}
                color={tokens.colors.textPrimary}
              />
              <View style={styles.modeTextWrap}>
                <Text style={styles.modeTitle}>Device-to-Device sync</Text>
                <Text style={styles.modeBody}>
                  Sync directly between your devices using QR code pairing.
                </Text>
              </View>
            </Pressable>

            <Pressable
              style={[styles.primaryButton, busy && styles.disabled]}
              onPress={() => {
                void onSaveMode(selectedMode);
              }}
              disabled={busy}
            >
              <Text style={styles.primaryButtonText}>
                {busy ? 'Saving mode...' : `Save ${modeTitle(selectedMode)}`}
              </Text>
            </Pressable>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recovery tools</Text>
            <Text style={styles.sectionBody}>
              Use recovery actions without re-running onboarding.
            </Text>

            <Pressable
              style={[styles.secondaryButton, busy && styles.disabled]}
              onPress={() => {
                void onImportLocalBackup();
              }}
              disabled={busy}
            >
              <MaterialIcons
                name="upload-file"
                size={18}
                color={tokens.colors.primary}
              />
              <Text style={styles.secondaryButtonText}>
                Import local backup
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.secondaryButton,
                (!d2dEnabled || busy) && styles.disabled,
              ]}
              onPress={() => {
                void onRestoreRelayBackup();
              }}
              disabled={!d2dEnabled || busy}
            >
              <MaterialIcons
                name="cloud-download"
                size={18}
                color={tokens.colors.primary}
              />
              <Text style={styles.secondaryButtonText}>Pair Device</Text>
            </Pressable>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Current mode</Text>
              <Text style={styles.infoValue}>{modeTitle(currentMode)}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Selected mode</Text>
              <Text style={styles.infoValue}>{modeTitle(selectedMode)}</Text>
            </View>
            {identityFingerprint ? (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Identity fingerprint</Text>
                <Text style={styles.infoValue}>{identityFingerprint}</Text>
              </View>
            ) : null}
          </View>

          {errorMessage ? (
            <Text style={styles.errorText}>{errorMessage}</Text>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

function createStyles(
  tokens: ThemeTokens,
  topInset: number,
  bottomInset: number,
) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: tokens.colors.bgBase,
    },
    header: {
      paddingTop: topInset + tokens.spacing.sm,
      paddingHorizontal: tokens.spacing.lg,
      paddingBottom: tokens.spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: tokens.colors.outlineVariant,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    backButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(tokens.colors.primary, 0.12),
    },
    title: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.subtitle,
      fontWeight: '700',
    },
    content: {
      padding: tokens.spacing.lg,
      paddingBottom: bottomInset + tokens.spacing.xxl,
      gap: tokens.spacing.md,
    },
    section: {
      borderRadius: tokens.radius.lg,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      backgroundColor: tokens.colors.surfaceContainer,
      padding: tokens.spacing.md,
      gap: tokens.spacing.sm,
    },
    sectionTitle: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.body,
      fontWeight: '700',
    },
    sectionBody: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.label,
      lineHeight: 17,
    },
    modeCard: {
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      backgroundColor: withAlpha(tokens.colors.surfaceContainerHigh, 0.75),
      padding: tokens.spacing.sm,
      flexDirection: 'row',
      gap: tokens.spacing.sm,
      alignItems: 'flex-start',
    },
    modeCardActive: {
      borderColor: withAlpha(tokens.colors.primary, 0.65),
      backgroundColor: withAlpha(tokens.colors.primary, 0.08),
    },
    modeTextWrap: {
      flex: 1,
      gap: 2,
    },
    modeTitle: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.body,
      fontWeight: '700',
    },
    modeBody: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.label,
      lineHeight: 16,
    },
    primaryButton: {
      borderRadius: tokens.radius.md,
      minHeight: 44,
      backgroundColor: tokens.colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: tokens.spacing.md,
      marginTop: tokens.spacing.xs,
    },
    primaryButtonText: {
      color: tokens.colors.onPrimary,
      fontSize: tokens.type.body,
      fontWeight: '700',
    },
    secondaryButton: {
      borderRadius: tokens.radius.md,
      minHeight: 44,
      borderWidth: 1,
      borderColor: withAlpha(tokens.colors.primary, 0.35),
      backgroundColor: withAlpha(tokens.colors.primary, 0.08),
      alignItems: 'center',
      justifyContent: 'center',
      gap: tokens.spacing.xs,
      flexDirection: 'row',
      paddingHorizontal: tokens.spacing.md,
    },
    secondaryButtonText: {
      color: tokens.colors.primary,
      fontSize: tokens.type.body,
      fontWeight: '700',
    },
    disabled: {
      opacity: 0.5,
    },
    infoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: tokens.spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: withAlpha(tokens.colors.outlineVariant, 0.65),
      paddingVertical: tokens.spacing.xs,
    },
    infoLabel: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.label,
      fontWeight: '500',
    },
    infoValue: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.label,
      fontWeight: '700',
      textAlign: 'right',
      flexShrink: 1,
    },
    errorText: {
      color: tokens.colors.error,
      fontSize: tokens.type.label,
      fontWeight: '600',
      textAlign: 'center',
    },
  });
}
