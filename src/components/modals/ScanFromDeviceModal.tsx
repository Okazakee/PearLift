import { CameraView, useCameraPermissions } from 'expo-camera';
import { ChevronLeft } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { AnimatedPressable } from '../../animation/primitives';
import {
  assembleChunkedPackets,
  decodeQrPayload,
} from '../../backup/qrBackupCodec';
import type { ThemeTokens } from '../../theme/tokens';
import { withAlpha } from '../../theme/tokens';
import { AnimatedScreenModal } from '../AnimatedScreenModal';

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
  const styles = useMemo(
    () => createStyles(tokens, topInset, bottomInset),
    [tokens, topInset, bottomInset],
  );
  const [permission, requestPermission] = useCameraPermissions();
  const [processing, setProcessing] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [chunkTransferId, setChunkTransferId] = useState<string | null>(null);
  const [chunkChecksum, setChunkChecksum] = useState<string | null>(null);
  const [chunkTotal, setChunkTotal] = useState(0);
  const [chunkPayloads, setChunkPayloads] = useState<Map<number, string>>(
    () => new Map(),
  );

  useEffect(() => {
    if (!open) return;
    setProcessing(false);
    setScanError(null);
    setChunkTransferId(null);
    setChunkChecksum(null);
    setChunkTotal(0);
    setChunkPayloads(new Map());
  }, [open]);

  const resetChunkState = () => {
    setChunkTransferId(null);
    setChunkChecksum(null);
    setChunkTotal(0);
    setChunkPayloads(new Map());
  };

  const handleScanned = async (rawPayload: string) => {
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
  };

  const permissionGranted = permission?.granted ?? false;

  return (
    <AnimatedScreenModal open={open} onClose={onClose}>
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
              onPress={() => void requestPermission()}
            >
              <Text style={styles.permissionButtonText}>
                {t('deviceTransfer.cameraPermissionButton')}
              </Text>
            </AnimatedPressable>
          </View>
        ) : (
          <View style={styles.cameraContainer}>
            <CameraView
              style={styles.camera}
              onBarcodeScanned={(event) => {
                if (processing) return;
                if (event.data) {
                  void handleScanned(String(event.data));
                }
              }}
              barcodeScannerSettings={{
                barcodeTypes: ['qr'],
              }}
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
      borderWidth: 1,
      borderColor: withAlpha(tokens.colors.outlineVariant, 0.9),
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
