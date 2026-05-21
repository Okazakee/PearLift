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
import {
  assembleChunkedPackets,
  decodeQrPayload,
} from '@/backup/qrBackupCodec';
import { AnimatedModalShell } from '@/components/AnimatedModalShell';
import { AnimatedScreenModal } from '@/components/AnimatedScreenModal';
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout';
import type { ThemeTokens } from '@/theme/tokens';
import { withAlpha } from '@/theme/tokens';

interface ScanFromDeviceModalProps {
  open: boolean;
  tokens: ThemeTokens;
  topInset: number;
  bottomInset: number;
  onScanPayload: (payload: string) => Promise<boolean>;
  onClose: () => void;
}

export function ScanFromDeviceModal({
  open,
  tokens,
  topInset,
  bottomInset,
  onScanPayload,
  onClose,
}: ScanFromDeviceModalProps) {
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
  const [chunkTransferId, setChunkTransferId] = useState<string | null>(null);
  const [chunkChecksum, setChunkChecksum] = useState<string | null>(null);
  const [chunkTotal, setChunkTotal] = useState(0);
  const [chunkPayloads, setChunkPayloads] = useState<Map<number, string>>(
    () => new Map(),
  );
  const scanLoopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const captureInFlightRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    setProcessing(false);
    setScanError(null);
    setChunkTransferId(null);
    setChunkChecksum(null);
    setChunkTotal(0);
    setChunkPayloads(new Map());
  }, [open]);

  useEffect(() => {
    return () => {
      if (scanLoopTimeoutRef.current) {
        clearTimeout(scanLoopTimeoutRef.current);
      }
    };
  }, []);

  const resetChunkState = useCallback(() => {
    setChunkTransferId(null);
    setChunkChecksum(null);
    setChunkTotal(0);
    setChunkPayloads(new Map());
  }, []);

  const handleScanned = useCallback(
    async (rawPayload: string) => {
      if (processing) return;
      setScanError(null);

      try {
        const decoded = decodeQrPayload(rawPayload);

        if (decoded.kind === 'raw') {
          setProcessing(true);
          const ok = await onScanPayload(decoded.payload);
          if (ok) {
            onClose();
            return;
          }
          setProcessing(false);
          setScanError(t('deviceTransfer.invalidQr'));
          return;
        }

        if (decoded.kind === 'single') {
          const payload = assembleChunkedPackets(
            new Map([[0, decoded.payload]]),
            1,
            decoded.checksum,
          );
          setProcessing(true);
          const ok = await onScanPayload(payload);
          if (ok) {
            onClose();
            return;
          }
          setProcessing(false);
          setScanError(t('deviceTransfer.invalidQr'));
          return;
        }

        const transferChanged =
          chunkTransferId !== decoded.transferId ||
          chunkChecksum !== decoded.checksum ||
          chunkTotal !== decoded.total;

        if (transferChanged) {
          setChunkTransferId(decoded.transferId);
          setChunkChecksum(decoded.checksum);
          setChunkTotal(decoded.total);
          const nextPayloads = new Map<number, string>();
          nextPayloads.set(decoded.index, decoded.payload);
          setChunkPayloads(nextPayloads);
          return;
        }

        const nextPayloads = new Map(chunkPayloads);
        if (!nextPayloads.has(decoded.index)) {
          nextPayloads.set(decoded.index, decoded.payload);
        }
        setChunkPayloads(nextPayloads);

        if (nextPayloads.size !== decoded.total) {
          return;
        }

        const payload = assembleChunkedPackets(
          nextPayloads,
          decoded.total,
          decoded.checksum,
        );
        setProcessing(true);
        const ok = await onScanPayload(payload);
        if (ok) {
          onClose();
          return;
        }
        resetChunkState();
        setProcessing(false);
        setScanError(t('deviceTransfer.invalidQr'));
      } catch {
        resetChunkState();
        setProcessing(false);
        setScanError(
          t('deviceTransfer.transferCorrupted', {
            defaultValue:
              'QR transfer failed integrity check. Please scan from the first chunk again.',
          }),
        );
      }
    },
    [
      chunkChecksum,
      chunkPayloads,
      chunkTotal,
      chunkTransferId,
      onClose,
      onScanPayload,
      processing,
      resetChunkState,
      t,
    ],
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
            {
              multiple: true,
            },
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

  const content = (
    <View style={styles.container}>
      <View style={styles.header}>
        <AnimatedPressable style={styles.backButton} onPress={onClose}>
          <ChevronLeft size={22} color={tokens.colors.textPrimary} />
        </AnimatedPressable>
        <Text style={styles.title}>{t('deviceTransfer.scanTitle')}</Text>
        <View style={styles.backButtonPlaceholder} />
      </View>

      {!permissionGranted ? (
        <View style={styles.permissionCard}>
          <Text style={styles.permissionTitle}>
            {t('deviceTransfer.cameraPermissionTitle')}
          </Text>
          <Text style={styles.permissionText}>
            {t('deviceTransfer.cameraPermissionMessage')}
          </Text>
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
              {processing
                ? t('app.loading')
                : chunkTotal > 0
                  ? t('deviceTransfer.chunkProgress', {
                      received: chunkPayloads.size,
                      total: chunkTotal,
                      defaultValue: 'Scan progress: {{received}}/{{total}}',
                    })
                  : t('deviceTransfer.scanDescription')}
            </Text>
            {scanError ? (
              <Text style={styles.overlayErrorText}>{scanError}</Text>
            ) : null}
          </View>
        </View>
      )}
    </View>
  );

  if (layout.isTablet) {
    return (
      <AnimatedModalShell
        open={open}
        onClose={onClose}
        slideFrom="right"
        containerStyle={styles.tabletPanelModalRoot}
        backdropStyle={styles.tabletPanelBackdrop}
        sheetStyle={styles.tabletPanelSheet}
      >
        {content}
      </AnimatedModalShell>
    );
  }

  return (
    <AnimatedScreenModal open={open} onClose={onClose}>
      {content}
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
    },
    tabletPanelModalRoot: {
      justifyContent: 'flex-start',
      alignItems: 'flex-end',
    },
    tabletPanelBackdrop: {
      ...StyleSheet.absoluteFill,
      backgroundColor: 'rgba(0, 0, 0, 0.34)',
    },
    tabletPanelSheet: {
      width: layout.isLandscape ? 600 : 520,
      height: '100%',
      overflow: 'hidden',
      borderTopLeftRadius: tokens.radius.xl,
      borderBottomLeftRadius: tokens.radius.xl,
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
      backgroundColor: tokens.colors.bgBase,
      zIndex: 10,
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
    permissionCard: {
      margin: tokens.spacing.lg,
      alignSelf: 'center',
      width: '100%',
      maxWidth: layout.isTablet ? 760 : undefined,
      borderRadius: tokens.radius.lg,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      backgroundColor: tokens.colors.surfaceContainer,
      padding: tokens.spacing.md,
      gap: tokens.spacing.sm,
    },
    permissionTitle: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.body,
      fontWeight: '800',
    },
    permissionText: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.body,
      lineHeight: 20,
    },
    permissionButton: {
      minHeight: 44,
      borderRadius: tokens.radius.md,
      backgroundColor: tokens.colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: tokens.spacing.md,
      marginTop: tokens.spacing.xs,
    },
    permissionButtonText: {
      color: tokens.colors.onPrimary,
      fontSize: tokens.type.body,
      fontWeight: '800',
    },
    cameraContainer: {
      flex: 1,
      backgroundColor: '#000000',
      alignSelf: 'center',
      width: '100%',
      maxWidth: layout.isTablet ? 960 : undefined,
      borderRadius: layout.isTablet ? tokens.radius.xl : 0,
      overflow: 'hidden',
    },
    camera: {
      flex: 1,
    },
    overlay: {
      position: 'absolute',
      left: tokens.spacing.lg,
      right: tokens.spacing.lg,
      bottom: bottomInset + tokens.spacing.lg,
      borderRadius: tokens.radius.lg,
      backgroundColor: withAlpha('#000000', 0.6),
      padding: tokens.spacing.md,
      gap: tokens.spacing.xs,
    },
    overlayText: {
      color: '#FFFFFF',
      fontSize: tokens.type.body,
      fontWeight: '700',
      textAlign: 'center',
    },
    overlayErrorText: {
      color: tokens.colors.accentWarning,
      fontSize: tokens.type.label,
      fontWeight: '800',
      textAlign: 'center',
    },
  });
}
