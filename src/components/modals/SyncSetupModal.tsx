import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Clipboard from 'expo-clipboard';
import { Camera } from 'lucide-react-native';
import QRCode from 'qrcode';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { AnimatedPressable } from '../../animation/primitives';
import { getPairingSecretPayload } from '../../sync/syncManager';
import type { SyncStatus } from '../../sync/types';
import type { ThemeTokens } from '../../theme/tokens';
import { withAlpha } from '../../theme/tokens';
import { getErrorMessage } from '../../utils/errors';
import { AnimatedScreenModal } from '../AnimatedScreenModal';

interface SyncSetupModalProps {
  open: boolean;
  tokens: ThemeTokens;
  topInset: number;
  bottomInset: number;
  syncStatus: SyncStatus;
  syncError: string | null;
  onStartSync: (pairingSecretBase64?: string) => Promise<void>;
  onStopSync: () => Promise<void>;
  onClose: () => void;
  onDone: () => void;
}

function normalizePairingCode(input: string) {
  return input.trim().toLowerCase().replace(/\s+/g, '');
}

function isValidPairingCode(code: string) {
  return /^[0-9a-f]{64}$/.test(code);
}

function extractPairingCode(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object' && 's' in parsed) {
      const s = (parsed as { s?: unknown }).s;
      if (typeof s === 'string') {
        const normalized = normalizePairingCode(s);
        return isValidPairingCode(normalized) ? normalized : null;
      }
    }
  } catch {
    // ignore
  }

  const normalized = normalizePairingCode(trimmed);
  return isValidPairingCode(normalized) ? normalized : null;
}

export function SyncSetupModal({
  open,
  tokens,
  topInset,
  bottomInset,
  syncStatus,
  syncError,
  onStartSync,
  onStopSync,
  onClose,
  onDone,
}: SyncSetupModalProps) {
  const { t } = useTranslation();
  const styles = useMemo(
    () => createStyles(tokens, topInset, bottomInset),
    [tokens, topInset, bottomInset],
  );

  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [myCode, setMyCode] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [qrSize, setQrSize] = useState(0);
  const [scanned, setScanned] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

  useEffect(() => {
    if (!open) {
      setMode('create');
      setMyCode(null);
      setJoinCode('');
      setLocalError(null);
      setBusy(false);
      setQrSvg(null);
      setQrSize(0);
      setScanned(false);
      return;
    }

    void (async () => {
      try {
        const code = await getPairingSecretPayload();
        setMyCode(code);
      } catch (error) {
        setLocalError(getErrorMessage(error));
      }
    })();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (!myCode) return;
    let cancelled = false;

    void (async () => {
      try {
        const svg = await QRCode.toString(myCode, {
          type: 'svg',
          margin: 1,
          color: {
            dark: '#111113',
            light: '#ffffff',
          },
        });
        if (cancelled) return;
        setQrSvg(svg);
      } catch {
        if (cancelled) return;
        setQrSvg(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, myCode]);

  const canStart =
    syncStatus === 'idle' || syncStatus === 'error' || syncStatus === 'synced';
  const isConnected = syncStatus === 'synced';

  const handleCopy = async () => {
    if (!myCode) return;
    setLocalError(null);
    try {
      await Clipboard.setStringAsync(myCode);
    } catch (error) {
      setLocalError(getErrorMessage(error));
    }
  };

  const handleScan = (data: string) => {
    if (scanned) return;
    const code = extractPairingCode(data);
    if (!code) {
      setLocalError(t('sync.setup.invalidCode'));
      return;
    }
    setScanned(true);
    setJoinCode(code);
    setLocalError(null);
  };

  const handleStart = async () => {
    if (!canStart) return;
    setLocalError(null);
    setBusy(true);
    try {
      if (mode === 'join') {
        const normalized = normalizePairingCode(joinCode);
        if (!isValidPairingCode(normalized)) {
          setLocalError(t('sync.setup.invalidCode'));
          return;
        }
        await onStartSync(normalized);
      } else {
        await onStartSync(myCode ?? undefined);
      }
    } catch (error) {
      setLocalError(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const handleStop = async () => {
    setLocalError(null);
    setBusy(true);
    try {
      await onStopSync();
    } catch (error) {
      setLocalError(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const showError = localError ?? syncError;

  return (
    <AnimatedScreenModal open={open} onClose={onClose}>
      <View style={styles.container}>
        <Text style={styles.title}>{t('sync.setup.title')}</Text>
        <Text style={styles.subtitle}>{t('sync.setup.subtitle')}</Text>

        <View style={styles.segmented}>
          <AnimatedPressable
            style={[styles.segment, mode === 'create' && styles.segmentActive]}
            onPress={() => {
              setScanned(false);
              setMode('create');
            }}
          >
            <Text
              style={[
                styles.segmentText,
                mode === 'create' && styles.segmentTextActive,
              ]}
            >
              {t('sync.setup.create')}
            </Text>
          </AnimatedPressable>
          <AnimatedPressable
            style={[styles.segment, mode === 'join' && styles.segmentActive]}
            onPress={() => {
              setScanned(false);
              setMode('join');
            }}
          >
            <Text
              style={[
                styles.segmentText,
                mode === 'join' && styles.segmentTextActive,
              ]}
            >
              {t('sync.setup.join')}
            </Text>
          </AnimatedPressable>
        </View>

        {mode === 'create' ? (
          <View style={styles.panel}>
            <Text style={styles.label}>{t('sync.setup.yourCode')}</Text>
            {qrSvg ? (
              <View
                style={styles.qrBox}
                onLayout={(event) => {
                  const next = Math.floor(event.nativeEvent.layout.width);
                  if (Number.isFinite(next) && next > 0 && next !== qrSize) {
                    setQrSize(next);
                  }
                }}
              >
                {qrSize > 0 ? (
                  <SvgXml xml={qrSvg} width={qrSize} height={qrSize} />
                ) : null}
              </View>
            ) : null}
            <View style={styles.codeBox}>
              <Text style={styles.codeText}>{myCode ?? '...'}</Text>
            </View>
            <Text style={styles.hintText}>{t('sync.setup.shareHint')}</Text>
          </View>
        ) : (
          <View style={styles.panel}>
            <Text style={styles.label}>{t('sync.setup.enterCode')}</Text>
            <View style={styles.scanBox}>
              {permission?.granted ? (
                <>
                  <CameraView
                    style={styles.camera}
                    barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                    onBarcodeScanned={(result) => {
                      if (typeof result?.data === 'string') {
                        handleScan(result.data);
                      }
                    }}
                  />
                  <View style={styles.cameraOverlay}>
                    <Text style={styles.scanText}>
                      {t('sync.setup.scanQr')}
                    </Text>
                    <Text style={styles.scanHelp}>
                      {t('sync.setup.scanHelp')}
                    </Text>
                  </View>
                </>
              ) : (
                <AnimatedPressable
                  style={styles.scanPlaceholder}
                  onPress={() => void requestPermission()}
                >
                  <View style={styles.scanBoxInner}>
                    <Camera size={34} color={tokens.colors.textSecondary} />
                  </View>
                  <Text style={styles.scanText}>
                    {t('sync.setup.scanEnableCamera')}
                  </Text>
                  <Text style={styles.scanHelp}>
                    {t('sync.setup.scanHelp')}
                  </Text>
                </AnimatedPressable>
              )}
            </View>
            <TextInput
              value={joinCode}
              onChangeText={setJoinCode}
              placeholder={t('sync.setup.codePlaceholder')}
              placeholderTextColor={tokens.colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="default"
              style={styles.input}
            />
          </View>
        )}

        {showError ? <Text style={styles.errorText}>{showError}</Text> : null}

        <View style={styles.actions}>
          {mode === 'create' && myCode ? (
            <AnimatedPressable
              style={styles.outlineButton}
              onPress={handleCopy}
            >
              <Text style={styles.outlineButtonText}>
                {t('sync.setup.copy')}
              </Text>
            </AnimatedPressable>
          ) : null}

          {isConnected ? (
            <AnimatedPressable
              style={styles.outlineButton}
              onPress={handleStop}
            >
              <Text style={styles.outlineButtonText}>
                {t('sync.setup.stop')}
              </Text>
            </AnimatedPressable>
          ) : null}

          <AnimatedPressable
            style={[styles.primaryButton, busy && styles.disabled]}
            onPress={isConnected ? onDone : handleStart}
            disabled={busy}
          >
            <Text style={styles.primaryButtonText}>
              {isConnected ? t('common.next') : t('sync.setup.start')}
            </Text>
          </AnimatedPressable>
        </View>
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
      paddingTop: topInset + tokens.spacing.xl,
      paddingHorizontal: tokens.spacing.lg,
      paddingBottom: bottomInset + tokens.spacing.lg,
      backgroundColor: tokens.colors.bgBase,
      gap: tokens.spacing.md,
    },
    title: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.title,
      fontWeight: '800',
      textAlign: 'center',
    },
    subtitle: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.body,
      lineHeight: 22,
      textAlign: 'center',
    },
    segmented: {
      flexDirection: 'row',
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      borderRadius: 999,
      overflow: 'hidden',
      backgroundColor: withAlpha(tokens.colors.primary, 0.06),
      marginTop: tokens.spacing.sm,
    },
    segment: {
      flex: 1,
      paddingVertical: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    segmentActive: {
      backgroundColor: withAlpha(tokens.colors.primary, 0.22),
    },
    segmentText: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.label,
      fontWeight: '800',
    },
    segmentTextActive: {
      color: tokens.colors.textPrimary,
    },
    panel: {
      borderRadius: tokens.radius.lg,
      backgroundColor: tokens.colors.surfaceContainer,
      padding: tokens.spacing.md,
      gap: tokens.spacing.md,
    },
    label: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.label,
      fontWeight: '700',
    },
    codeBox: {
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      backgroundColor: tokens.colors.surfaceContainerHigh,
      padding: tokens.spacing.md,
    },
    qrBox: {
      borderRadius: tokens.radius.lg,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      backgroundColor: '#ffffff',
      width: '80%',
      alignItems: 'center',
      justifyContent: 'center',
      aspectRatio: 1,
      overflow: 'hidden',
      alignSelf: 'center',
    },
    codeText: {
      color: tokens.colors.textPrimary,
      fontSize: 12,
      lineHeight: 16,
      fontFamily: 'SpaceGrotesk_600SemiBold',
    },
    hintText: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.label,
      lineHeight: 18,
    },
    scanBox: {
      borderRadius: tokens.radius.lg,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      backgroundColor: tokens.colors.surfaceContainerHigh,
      aspectRatio: 1,
      overflow: 'hidden',
    },
    camera: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    },
    cameraOverlay: {
      position: 'absolute',
      right: 0,
      bottom: 0,
      left: 0,
      padding: tokens.spacing.md,
      backgroundColor: withAlpha('#111113', 0.35),
      gap: 4,
    },
    scanPlaceholder: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: tokens.spacing.lg,
      gap: 6,
    },
    scanBoxInner: {
      width: 86,
      height: 86,
      borderRadius: 24,
      backgroundColor: withAlpha(tokens.colors.primary, 0.1),
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: tokens.spacing.sm,
      borderWidth: 1,
      borderColor: withAlpha(tokens.colors.primary, 0.22),
    },
    scanText: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.body,
      fontWeight: '800',
    },
    scanHelp: {
      color: withAlpha(tokens.colors.textPrimary, 0.8),
      fontSize: tokens.type.label,
      lineHeight: 18,
    },
    input: {
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      backgroundColor: tokens.colors.surfaceContainerHigh,
      paddingHorizontal: tokens.spacing.md,
      paddingVertical: tokens.spacing.sm,
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.body,
      fontFamily: 'SpaceGrotesk_600SemiBold',
    },
    errorText: {
      color: tokens.colors.accentDanger,
      fontSize: tokens.type.label,
      textAlign: 'center',
    },
    actions: {
      flexDirection: 'column',
      gap: tokens.spacing.sm,
      marginTop: tokens.spacing.sm,
    },
    outlineButton: {
      minHeight: 48,
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: tokens.colors.surfaceContainerHigh,
      paddingHorizontal: tokens.spacing.md,
    },
    outlineButtonText: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.body,
      fontWeight: '800',
    },
    primaryButton: {
      minHeight: 48,
      borderRadius: tokens.radius.md,
      backgroundColor: tokens.colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: tokens.spacing.md,
    },
    primaryButtonText: {
      color: tokens.colors.onPrimary,
      fontSize: tokens.type.body,
      fontWeight: '800',
    },
    disabled: {
      opacity: 0.6,
    },
  });
}
