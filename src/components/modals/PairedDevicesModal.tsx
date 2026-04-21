import { ChevronLeft, Trash2 } from 'lucide-react-native';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { AnimatedPressable } from '../../animation/primitives';
import type { PairedDevice } from '../../storage/types';
import type { ThemeTokens } from '../../theme/tokens';
import { withAlpha } from '../../theme/tokens';
import { AnimatedScreenModal } from '../AnimatedScreenModal';

interface PairedDevicesModalProps {
  open: boolean;
  tokens: ThemeTokens;
  topInset: number;
  bottomInset: number;
  pairedDevices: PairedDevice[];
  onForgetDevice: (deviceId: string) => void;
  onClose: () => void;
}

export function PairedDevicesModal({
  open,
  tokens,
  topInset,
  bottomInset,
  pairedDevices,
  onForgetDevice,
  onClose,
}: PairedDevicesModalProps) {
  const { t } = useTranslation();
  const styles = useMemo(
    () => createStyles(tokens, topInset, bottomInset),
    [tokens, topInset, bottomInset],
  );

  return (
    <AnimatedScreenModal open={open} onClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <AnimatedPressable style={styles.backButton} onPress={onClose}>
            <ChevronLeft size={22} color={tokens.colors.textPrimary} />
          </AnimatedPressable>
          <Text style={styles.title}>
            {t('settings.syncBackup.pairedDevices')}
          </Text>
          <View style={styles.backButtonPlaceholder} />
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {pairedDevices.length === 0 ? (
            <Text style={styles.rowSubtitle}>
              {t('settings.syncBackup.noDevices')}
            </Text>
          ) : (
            pairedDevices.map((device) => (
              <View key={device.deviceId} style={styles.deviceRow}>
                <View style={styles.deviceInfo}>
                  <Text style={styles.deviceIdText}>
                    {device.deviceId.slice(0, 8)}…{device.deviceId.slice(-8)}
                  </Text>
                  <Text style={styles.deviceLastSeen}>
                    {t('settings.syncBackup.lastSeen')}{' '}
                    {new Date(device.lastSeen).toLocaleDateString()}
                  </Text>
                </View>
                <AnimatedPressable
                  style={styles.forgetButton}
                  onPress={() => onForgetDevice(device.deviceId)}
                >
                  <Trash2 size={13} color={tokens.colors.accentDanger} />
                  <Text style={styles.forgetButtonText}>
                    {t('settings.syncBackup.forgetDevice')}
                  </Text>
                </AnimatedPressable>
              </View>
            ))
          )}
        </ScrollView>
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
      backgroundColor: tokens.colors.bgSurface,
    },
    backButtonPlaceholder: {
      width: 36,
      height: 36,
    },
    title: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.subtitle,
      fontWeight: '700',
    },
    content: {
      padding: tokens.spacing.lg,
      paddingBottom: bottomInset + tokens.spacing.xxl,
      gap: tokens.spacing.sm,
    },
    rowSubtitle: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.label,
      lineHeight: 16,
    },
    deviceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: tokens.spacing.xs,
      borderBottomWidth: 0.5,
      borderBottomColor:
        tokens.mode === 'dark'
          ? withAlpha('#d1d1d6', 0.18)
          : withAlpha(tokens.colors.outline, 0.12),
    },
    deviceInfo: {
      flex: 1,
      gap: 2,
    },
    deviceIdText: {
      color: tokens.colors.textPrimary,
      fontSize: 12,
      fontFamily: 'SpaceGrotesk_600SemiBold',
    },
    deviceLastSeen: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.label,
    },
    forgetButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: tokens.spacing.sm,
      paddingVertical: tokens.spacing.xs,
      borderRadius: tokens.radius.sm,
      borderWidth: 1,
      borderColor: withAlpha(tokens.colors.accentDanger, 0.35),
      backgroundColor: withAlpha(tokens.colors.error, 0.08),
    },
    forgetButtonText: {
      color: tokens.colors.accentDanger,
      fontSize: tokens.type.label,
      fontWeight: '700',
    },
  });
}
