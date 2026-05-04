import * as Clipboard from 'expo-clipboard';
import { ClipboardPaste, DoorOpen, KeyRound } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { AnimatedPressable } from '../../animation/primitives';
import type { SyncDataSummary } from '../../storage/types';
import type { ThemeTokens } from '../../theme/tokens';
import { AnimatedScreenModal } from '../AnimatedScreenModal';

interface SyncJoinRoomModalProps {
  open: boolean;
  tokens: ThemeTokens;
  topInset: number;
  bottomInset: number;
  localSummary: SyncDataSummary | null;
  onJoinRoom: (masterKey: string) => Promise<void>;
  onClose: () => void;
}

export function SyncJoinRoomModal({
  open,
  tokens,
  topInset,
  bottomInset,
  localSummary,
  onJoinRoom,
  onClose,
}: SyncJoinRoomModalProps) {
  const { t } = useTranslation();
  const styles = useMemo(
    () => createStyles(tokens, topInset, bottomInset),
    [tokens, topInset, bottomInset],
  );
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <AnimatedScreenModal open={open} onClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('sync.join.title')}</Text>
          <Text style={styles.subtitle}>{t('sync.join.subtitle')}</Text>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <DoorOpen size={16} color={tokens.colors.primary} />
            <Text style={styles.sectionTitle}>{t('sync.join.preflight')}</Text>
          </View>
          <Text style={styles.helperText}>
            {t('sync.join.localSummary', {
              workouts: localSummary?.workoutCount ?? 0,
              exercises: localSummary?.exerciseCount ?? 0,
            })}
          </Text>
          <Text style={styles.helperText}>
            {t('sync.join.remoteSummaryHint')}
          </Text>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <KeyRound size={16} color={tokens.colors.primary} />
            <Text style={styles.sectionTitle}>{t('sync.join.masterKey')}</Text>
          </View>
          <TextInput
            value={key}
            onChangeText={setKey}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            placeholder={t('sync.join.keyPlaceholder')}
            placeholderTextColor={tokens.colors.textSecondary}
            style={styles.input}
          />
          <AnimatedPressable
            style={styles.outlineButton}
            onPress={() => void Clipboard.getStringAsync().then(setKey)}
          >
            <ClipboardPaste size={15} color={tokens.colors.textPrimary} />
            <Text style={styles.outlineButtonText}>{t('sync.join.paste')}</Text>
          </AnimatedPressable>
        </View>

        <AnimatedPressable
          style={styles.primaryButton}
          onPress={() => {
            setBusy(true);
            void onJoinRoom(key).finally(() => setBusy(false));
          }}
        >
          {busy ? (
            <ActivityIndicator color={tokens.colors.onPrimary} />
          ) : (
            <Text style={styles.primaryButtonText}>
              {t('sync.join.joinRoom')}
            </Text>
          )}
        </AnimatedPressable>
      </View>
    </AnimatedScreenModal>
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
      paddingTop: topInset + tokens.spacing.lg,
      paddingHorizontal: tokens.spacing.lg,
      paddingBottom: bottomInset + tokens.spacing.xl,
      gap: tokens.spacing.md,
    },
    header: { gap: 4 },
    title: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.subtitle,
      fontWeight: '700',
    },
    subtitle: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.label,
    },
    section: {
      borderRadius: tokens.radius.lg,
      backgroundColor: tokens.colors.surfaceContainer,
      padding: tokens.spacing.md,
      gap: tokens.spacing.sm,
    },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    sectionTitle: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.body,
      fontWeight: '700',
    },
    helperText: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.label,
    },
    input: {
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      backgroundColor: tokens.colors.surfaceContainerHigh,
      color: tokens.colors.textPrimary,
      paddingHorizontal: tokens.spacing.md,
      paddingVertical: tokens.spacing.sm,
      fontSize: 12,
      fontFamily: 'monospace',
    },
    outlineButton: {
      minHeight: 42,
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      backgroundColor: tokens.colors.surfaceContainerHigh,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: tokens.spacing.sm,
    },
    outlineButtonText: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.label,
      fontWeight: '700',
    },
    primaryButton: {
      minHeight: 48,
      borderRadius: tokens.radius.md,
      backgroundColor: tokens.colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 'auto',
    },
    primaryButtonText: {
      color: tokens.colors.onPrimary,
      fontSize: tokens.type.label,
      fontWeight: '800',
    },
  });
}
