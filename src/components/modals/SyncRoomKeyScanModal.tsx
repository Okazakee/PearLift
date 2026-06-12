import { ChevronLeft } from 'lucide-react-native';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Camera } from 'react-native-vision-camera';
import { AnimatedPressable } from '@/animation/primitives';
import { AnimatedScreenModal } from '@/components/AnimatedScreenModal';
import { usePhotoQrScanner } from '@/hooks/usePhotoQrScanner';
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout';
import type { ThemeTokens } from '@/theme/tokens';
import { withAlpha } from '@/theme/tokens';
import { Text } from '../AppText';

interface SyncRoomKeyScanModalProps {
  open: boolean;
  tokens: ThemeTokens;
  topInset: number;
  bottomInset: number;
  onScanPayload: (payload: string) => Promise<boolean>;
  onClose: () => void;
}

export function SyncRoomKeyScanModal({
  open,
  tokens,
  topInset,
  bottomInset,
  onScanPayload,
  onClose,
}: SyncRoomKeyScanModalProps) {
  const { t } = useTranslation();
  const layout = useResponsiveLayout();
  const styles = useMemo(
    () => createStyles(tokens, topInset, bottomInset, layout),
    [tokens, topInset, bottomInset, layout],
  );
  const [processing, setProcessing] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const prevOpenRef = useRef(open);

  if (open !== prevOpenRef.current) {
    prevOpenRef.current = open;
    if (open) {
      setProcessing(false);
      setScanError(null);
    }
  }

  const handleScanned = useCallback(
    async (payload: string) => {
      if (processing) return;
      setProcessing(true);
      setScanError(null);

      const ok = await onScanPayload(payload);
      if (ok) {
        onClose();
        return;
      }

      setProcessing(false);
      setScanError(t('sync.join.invalidKey'));
    },
    [onClose, onScanPayload, processing, t],
  );
  const { permission, device, photoOutput } = usePhotoQrScanner({
    open,
    processing,
    onPayload: handleScanned,
  });

  const permissionGranted = permission.hasPermission;

  return (
    <AnimatedScreenModal open={open} onClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <AnimatedPressable style={styles.backButton} onPress={onClose}>
            <ChevronLeft size={22} color={tokens.colors.textPrimary} />
          </AnimatedPressable>
          <Text style={styles.title}>{t('sync.join.scanQr')}</Text>
          <View style={styles.backButtonPlaceholder} />
        </View>

        {!permissionGranted ? (
          <View style={styles.permissionCard}>
            <Text style={styles.permissionTitle}>
              {t('deviceTransfer.cameraPermissionTitle')}
            </Text>
            <Text style={styles.permissionText}>{t('sync.join.scanHelp')}</Text>
            <AnimatedPressable
              style={styles.permissionButton}
              onPress={() => void permission.requestPermission()}
            >
              <Text style={styles.permissionButtonText}>
                {t('deviceTransfer.cameraPermissionButton')}
              </Text>
            </AnimatedPressable>
          </View>
        ) : !device ? (
          <View style={styles.permissionCard}>
            <Text style={styles.permissionTitle}>
              {t('deviceTransfer.cameraUnavailableTitle')}
            </Text>
            <Text style={styles.permissionText}>
              {t('deviceTransfer.cameraUnavailableMessage')}
            </Text>
          </View>
        ) : (
          <View style={styles.cameraContainer}>
            <Camera
              style={styles.camera}
              device={device}
              outputs={[photoOutput]}
              isActive={open}
            />

            <View style={styles.overlay}>
              <Text style={styles.overlayText}>
                {processing ? t('app.loading') : t('sync.join.scanHelp')}
              </Text>
              {scanError ? (
                <Text style={styles.overlayErrorText}>{scanError}</Text>
              ) : null}
            </View>
          </View>
        )}
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
      paddingTop: topInset + tokens.spacing.md,
      paddingHorizontal: tokens.spacing.lg,
      paddingBottom: bottomInset + tokens.spacing.lg,
      gap: tokens.spacing.md,
    },
    header: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    backButton: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: tokens.radius.pill,
      backgroundColor: tokens.colors.surfaceContainer,
    },
    backButtonPlaceholder: { width: 40, height: 40 },
    title: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.subtitle,
      fontWeight: '800',
    },
    permissionCard: {
      alignSelf: 'center',
      width: '100%',
      maxWidth: layout.isTablet ? 760 : undefined,
      borderRadius: tokens.radius.lg,
      padding: tokens.spacing.lg,
      backgroundColor: tokens.colors.surfaceContainer,
      gap: tokens.spacing.sm,
    },
    permissionTitle: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.subtitle,
      fontWeight: '800',
    },
    permissionText: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.body,
    },
    permissionButton: {
      minHeight: 44,
      borderRadius: tokens.radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: tokens.colors.primary,
      marginTop: tokens.spacing.sm,
    },
    permissionButtonText: {
      color: tokens.colors.onPrimary,
      fontSize: tokens.type.label,
      fontWeight: '800',
    },
    cameraContainer: {
      flex: 1,
      width: '100%',
      maxWidth: layout.isTablet ? 960 : undefined,
      alignSelf: 'center',
      overflow: 'hidden',
      borderRadius: tokens.radius.xl,
      backgroundColor: tokens.colors.surfaceContainer,
    },
    camera: {
      ...StyleSheet.absoluteFill,
    },
    overlay: {
      position: 'absolute',
      left: tokens.spacing.md,
      right: tokens.spacing.md,
      bottom: tokens.spacing.md,
      borderRadius: tokens.radius.lg,
      padding: tokens.spacing.md,
      backgroundColor: withAlpha(tokens.colors.bgBase, 0.86),
      gap: tokens.spacing.xs,
    },
    overlayText: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.body,
      fontWeight: '700',
      textAlign: 'center',
    },
    overlayErrorText: {
      color: tokens.colors.accentDanger,
      fontSize: tokens.type.label,
      textAlign: 'center',
    },
  });
}
