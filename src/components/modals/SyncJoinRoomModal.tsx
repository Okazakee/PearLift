import * as Clipboard from 'expo-clipboard';
import {
  Check,
  ClipboardPaste,
  DoorOpen,
  KeyRound,
  QrCode,
  X,
} from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { AnimatedPressable } from '@/animation/primitives';
import { AnimatedScreenModal } from '@/components/AnimatedScreenModal';
import { E2E_IDS } from '@/config/testIds';
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout';
import type { SyncDataSummary } from '@/storage/types';
import { decodeSyncRoomInvite } from '@/sync/roomInvite';
import type { ThemeTokens } from '@/theme/tokens';
import { withAlpha } from '@/theme/tokens';
import { Text, TextInput } from '../AppText';

interface SyncJoinRoomModalProps {
  open: boolean;
  tokens: ThemeTokens;
  topInset: number;
  bottomInset: number;
  localSummary: SyncDataSummary | null;
  onJoinRoom: (masterKey: string) => Promise<boolean>;
  onScanRoomKey: () => void;
  onClose: () => void;
}

export function SyncJoinRoomModal({
  open,
  tokens,
  topInset,
  bottomInset,
  localSummary,
  onJoinRoom,
  onScanRoomKey,
  onClose,
}: SyncJoinRoomModalProps) {
  const { t } = useTranslation();
  const layout = useResponsiveLayout();
  const styles = useMemo(
    () => createStyles(tokens, topInset, bottomInset, layout),
    [tokens, topInset, bottomInset, layout],
  );
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [keyValid, setKeyValid] = useState<boolean | null>(null);
  const [pasteFeedback, setPasteFeedback] = useState<'valid' | 'empty' | null>(
    null,
  );
  const pasteFade = useSharedValue(0);
  const pasteFeedbackHideTimer = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const validateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (validateTimer.current) clearTimeout(validateTimer.current);
      if (pasteFeedbackHideTimer.current) {
        clearTimeout(pasteFeedbackHideTimer.current);
      }
    };
  }, []);

  const pasteFeedbackStyle = useAnimatedStyle(() => ({
    opacity: pasteFade.value,
  }));

  const triggerPasteFeedback = (kind: 'valid' | 'empty') => {
    if (pasteFeedbackHideTimer.current) {
      clearTimeout(pasteFeedbackHideTimer.current);
    }
    setPasteFeedback(kind);
    pasteFade.value = 1;
    pasteFade.value = withTiming(0, { duration: 1800 });
    pasteFeedbackHideTimer.current = setTimeout(() => {
      setPasteFeedback(null);
    }, 1800);
  };

  const handlePaste = () => {
    void Clipboard.getStringAsync().then((value) => {
      if (!value.trim()) {
        triggerPasteFeedback('empty');
        return;
      }
      setKey(value);
      triggerPasteFeedback('valid');
    });
  };

  const handleKeyChange = (value: string) => {
    setKey(value);
    setKeyValid(null);
    if (validateTimer.current) clearTimeout(validateTimer.current);
    if (!value.trim()) return;
    validateTimer.current = setTimeout(() => {
      try {
        decodeSyncRoomInvite(value);
        setKeyValid(true);
      } catch {
        setKeyValid(false);
      }
    }, 300);
  };

  return (
    <AnimatedScreenModal
      open={open}
      onClose={onClose}
      presentation={layout.isTablet ? 'tablet-sheet' : 'fullscreen'}
      maxWidth={layout.isLandscape ? 820 : 720}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.title}>{t('sync.join.title')}</Text>
            <Text style={styles.subtitle}>{t('sync.join.subtitle')}</Text>
          </View>
          <Pressable
            onPress={onClose}
            style={styles.closeButton}
            hitSlop={8}
            testID={E2E_IDS.syncJoin.close}
          >
            <X size={20} color={tokens.colors.textSecondary} />
          </Pressable>
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
            onChangeText={handleKeyChange}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            placeholder={t('sync.join.keyPlaceholder')}
            placeholderTextColor={tokens.colors.textSecondary}
            style={[
              styles.input,
              keyValid === true && styles.inputValid,
              keyValid === false && styles.inputInvalid,
            ]}
            testID={E2E_IDS.syncJoin.input}
          />
          {keyValid === true ? (
            <View style={styles.validationRow}>
              <Check size={14} color={tokens.colors.primary} />
              <Text
                style={[styles.helperText, { color: tokens.colors.primary }]}
              >
                {t('sync.join.keyValid')}
              </Text>
            </View>
          ) : keyValid === false ? (
            <Text
              style={[styles.helperText, { color: tokens.colors.accentDanger }]}
            >
              {t('sync.join.invalidKey')}
            </Text>
          ) : null}
          <View style={styles.buttonRow}>
            <AnimatedPressable
              style={styles.outlineButton}
              onPress={handlePaste}
              testID={E2E_IDS.syncJoin.paste}
            >
              <ClipboardPaste size={15} color={tokens.colors.textPrimary} />
              <Text style={styles.outlineButtonText}>
                {t('sync.join.paste')}
              </Text>
            </AnimatedPressable>
            <AnimatedPressable
              style={styles.outlineButton}
              onPress={onScanRoomKey}
              testID={E2E_IDS.syncJoin.scan}
            >
              <QrCode size={15} color={tokens.colors.textPrimary} />
              <Text style={styles.outlineButtonText}>
                {t('sync.join.scanQr')}
              </Text>
            </AnimatedPressable>
          </View>
          {pasteFeedback ? (
            <Animated.View style={pasteFeedbackStyle}>
              <Text
                style={[
                  styles.helperText,
                  pasteFeedback === 'valid'
                    ? { color: tokens.colors.primary }
                    : { color: tokens.colors.accentDanger },
                ]}
              >
                {pasteFeedback === 'valid'
                  ? t('sync.join.pasteSuccess')
                  : t('sync.join.pasteEmpty')}
              </Text>
            </Animated.View>
          ) : null}
        </View>

        <AnimatedPressable
          style={styles.primaryButton}
          onPress={() => {
            setBusy(true);
            void onJoinRoom(key).finally(() => setBusy(false));
          }}
          testID={E2E_IDS.syncJoin.join}
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
  layout: ReturnType<typeof useResponsiveLayout>,
) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: tokens.colors.bgBase,
      paddingTop: topInset + tokens.spacing.lg,
      paddingHorizontal: tokens.spacing.lg,
      paddingBottom: bottomInset + tokens.spacing.xl,
      gap: tokens.spacing.md,
      alignSelf: 'center',
      width: '100%',
      maxWidth: layout.isTablet ? 760 : undefined,
    },
    header: { gap: 4, flexDirection: 'row', alignItems: 'flex-start' },
    headerLeft: { flex: 1 },
    closeButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(tokens.colors.textSecondary, 0.1),
    },
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
    inputValid: {
      borderColor: tokens.colors.primary,
    },
    inputInvalid: {
      borderColor: tokens.colors.accentDanger,
    },
    validationRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    outlineButton: {
      flex: 1,
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
    buttonRow: {
      flexDirection: 'row',
      gap: tokens.spacing.sm,
      flexWrap: 'wrap',
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
