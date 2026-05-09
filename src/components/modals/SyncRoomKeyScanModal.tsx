import { fromByteArray } from 'base64-js';
import { ChevronLeft } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import {
  Camera,
  CommonResolutions,
  useCameraDevice,
  useCameraPermission,
  usePhotoOutput,
} from 'react-native-vision-camera';
import { decodeBase64 } from 'vision-camera-zxing';
import { AnimatedPressable } from '@/animation/primitives';
import { AnimatedScreenModal } from '@/components/AnimatedScreenModal';
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout';
import type { ThemeTokens } from '@/theme/tokens';
import { withAlpha } from '@/theme/tokens';

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
  const permission = useCameraPermission();
  const device = useCameraDevice('back');
  const photoOutput = usePhotoOutput({
    targetResolution: CommonResolutions.LOWEST_4_3,
    containerFormat: 'jpeg',
    quality: 0.65,
    qualityPrioritization: 'speed',
  });
  const [processing, setProcessing] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const scanLoopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const captureInFlightRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    setProcessing(false);
    setScanError(null);
  }, [open]);

  useEffect(() => {
    return () => {
      if (scanLoopTimeoutRef.current) {
        clearTimeout(scanLoopTimeoutRef.current);
      }
    };
  }, []);

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

  const permissionGranted = permission.hasPermission;

  useEffect(() => {
    if (!open || !permissionGranted || !device) return;

    let cancelled = false;

    const queueNextCapture = (delayMs: number) => {
      if (scanLoopTimeoutRef.current) {
        clearTimeout(scanLoopTimeoutRef.current);
      }
      scanLoopTimeoutRef.current = setTimeout(() => {
        if (cancelled) return;
        void captureAndDecode();
      }, delayMs);
    };

    const captureAndDecode = async () => {
      if (cancelled || captureInFlightRef.current || processing) {
        queueNextCapture(400);
        return;
      }

      captureInFlightRef.current = true;
      let nextDelayMs = 350;

      try {
        const photo = await photoOutput.capturePhoto(
          { enableShutterSound: false },
          {},
        );
        try {
          const fileData = await photo.getFileDataAsync();
          const qrResults = await decodeBase64(
            fromByteArray(new Uint8Array(fileData)),
            { multiple: true },
          );
          const payload = qrResults.find(
            (result) => result.barcodeText,
          )?.barcodeText;
          if (payload) {
            nextDelayMs = 900;
            await handleScanned(payload);
          }
        } finally {
          photo.dispose();
        }
      } catch {
        nextDelayMs = 700;
      } finally {
        captureInFlightRef.current = false;
      }

      if (!cancelled) {
        queueNextCapture(nextDelayMs);
      }
    };

    queueNextCapture(250);

    return () => {
      cancelled = true;
      captureInFlightRef.current = false;
      if (scanLoopTimeoutRef.current) {
        clearTimeout(scanLoopTimeoutRef.current);
        scanLoopTimeoutRef.current = null;
      }
    };
  }, [device, handleScanned, open, permissionGranted, photoOutput, processing]);

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
      ...StyleSheet.absoluteFillObject,
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
