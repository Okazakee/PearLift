import {
  ChevronLeft,
  Pause,
  Play,
  QrCode,
  SkipBack,
  SkipForward,
} from 'lucide-react-native';
import QRCode from 'qrcode';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { AnimatedPressable } from '@/animation/primitives';
import { encodeBackupForQr } from '@/backup/qrBackupCodec';
import type { BackupProgramCollection } from '@/backup/types';
import { AnimatedModalShell } from '@/components/AnimatedModalShell';
import { AnimatedScreenModal } from '@/components/AnimatedScreenModal';
import { E2E_IDS } from '@/config/testIds';
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout';
import type { ThemeTokens } from '@/theme/tokens';
import { withAlpha } from '@/theme/tokens';
import { getErrorMessage, logError } from '@/utils/errors';
import { Text } from '../AppText';

interface ShareToDeviceModalProps {
  open: boolean;
  tokens: ThemeTokens;
  topInset: number;
  bottomInset: number;
  backupCollection: BackupProgramCollection | null;
  onClose: () => void;
}

export function ShareToDeviceModal({
  open,
  tokens,
  topInset,
  bottomInset,
  backupCollection,
  onClose,
}: ShareToDeviceModalProps) {
  const { t } = useTranslation();
  const layout = useResponsiveLayout();
  const styles = useMemo(
    () => createStyles(tokens, topInset, bottomInset, layout),
    [tokens, topInset, bottomInset, layout],
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const prevOpenRef = useRef(open);
  const prevBackupCollectionRef = useRef<BackupProgramCollection | null>(
    backupCollection,
  );

  if (open !== prevOpenRef.current) {
    prevOpenRef.current = open;
    if (open) {
      setActiveIndex(0);
      setPaused(false);
    }
  }

  if (open && backupCollection !== prevBackupCollectionRef.current) {
    prevBackupCollectionRef.current = backupCollection;
    setActiveIndex(0);
    setPaused(false);
  } else if (!open && prevBackupCollectionRef.current !== backupCollection) {
    prevBackupCollectionRef.current = backupCollection;
  }

  const encodedTransfer = useMemo(() => {
    if (!backupCollection) {
      return {
        packets: [] as string[],
        isChunked: false,
        encodeError: null as string | null,
      };
    }

    try {
      const encoded = encodeBackupForQr(backupCollection);
      return {
        packets: encoded.packets,
        isChunked: encoded.mode === 'chunked',
        encodeError: null,
      };
    } catch (error) {
      return {
        packets: [] as string[],
        isChunked: false,
        encodeError: getErrorMessage(error),
      };
    }
  }, [backupCollection]);

  const packets = encodedTransfer.packets;
  const isChunked = encodedTransfer.isChunked;

  useEffect(() => {
    if (!open || !isChunked || paused || packets.length <= 1) return;
    const interval = setInterval(() => {
      setActiveIndex((current) => (current + 1) % packets.length);
    }, 700);
    return () => {
      clearInterval(interval);
    };
  }, [open, isChunked, paused, packets.length]);

  const safeActiveIndex =
    packets.length === 0 ? 0 : activeIndex % packets.length;
  const activePayload = packets[safeActiveIndex] ?? null;
  const totalPackets = packets.length;
  const chunkProgress =
    totalPackets > 0 ? (safeActiveIndex + 1) / totalPackets : 0;
  const qrRender = useMemo(() => {
    if (!open || !activePayload) return null;
    try {
      const symbol = QRCode.create(activePayload, {
        errorCorrectionLevel: 'M',
      });
      const margin = 1;
      const darkModules: string[] = [];
      for (let row = 0; row < symbol.modules.size; row += 1) {
        for (let col = 0; col < symbol.modules.size; col += 1) {
          if (symbol.modules.get(row, col)) {
            darkModules.push(`M${col + margin} ${row + margin}h1v1h-1z`);
          }
        }
      }
      return {
        size: symbol.modules.size + margin * 2,
        darkPath: darkModules.join(''),
      };
    } catch (renderError) {
      return {
        error: getErrorMessage(renderError),
      };
    }
  }, [open, activePayload]);
  const encodeError = encodedTransfer.encodeError;
  const qrRenderError = qrRender && 'error' in qrRender ? qrRender.error : null;
  const visibleError = encodeError
    ? t('deviceTransfer.tooLarge')
    : qrRenderError
      ? t('prompts.exportBackup.failedTitle')
      : null;

  useEffect(() => {
    if (!open || !encodeError) return;
    logError('backup/qr-export encode failed', {
      error: encodeError,
    });
  }, [encodeError, open]);

  useEffect(() => {
    if (!open || !activePayload || !qrRenderError) return;
    logError('backup/qr-export render failed', {
      error: qrRenderError,
      packetIndex: safeActiveIndex,
      packetLength: activePayload.length,
    });
  }, [open, activePayload, qrRenderError, safeActiveIndex]);

  const content = (
    <View style={styles.container}>
      <View style={styles.header}>
        <AnimatedPressable
          style={styles.backButton}
          onPress={onClose}
          testID={E2E_IDS.shareToDevice.close}
        >
          <ChevronLeft size={22} color={tokens.colors.textPrimary} />
        </AnimatedPressable>
        <Text style={styles.title}>{t('deviceTransfer.shareTitle')}</Text>
        <View style={styles.backButtonPlaceholder} />
      </View>

      <View style={styles.content}>
        <View style={styles.leadRow}>
          <View style={styles.leadIcon}>
            <QrCode size={18} color={tokens.colors.primary} />
          </View>
          <Text style={styles.leadText}>
            {t('deviceTransfer.shareDescription')}
          </Text>
        </View>

        <View style={styles.qrCard}>
          {!activePayload ? (
            <ActivityIndicator color={tokens.colors.primary} />
          ) : visibleError ? (
            <Text style={styles.errorText}>{visibleError}</Text>
          ) : qrRender && 'darkPath' in qrRender ? (
            <View style={styles.qrContent}>
              <View style={styles.metaRow}>
                <View
                  style={[
                    styles.modeBadge,
                    isChunked
                      ? styles.modeBadgeChunked
                      : styles.modeBadgeSingle,
                  ]}
                >
                  <Text style={styles.modeBadgeText}>
                    {isChunked
                      ? t('deviceTransfer.modeChunked', {
                          defaultValue: 'Chunked transfer',
                        })
                      : t('deviceTransfer.modeSingle', {
                          defaultValue: 'Single QR',
                        })}
                  </Text>
                </View>
                <Text style={styles.metaCounter}>
                  {t('deviceTransfer.shareChunkCounter', {
                    current: safeActiveIndex + 1,
                    total: Math.max(totalPackets, 1),
                    defaultValue: 'Chunk {{current}}/{{total}}',
                  })}
                </Text>
              </View>

              <View
                style={styles.qrImage}
                testID={E2E_IDS.shareToDevice.qrContainer}
              >
                <Svg
                  width="100%"
                  height="100%"
                  viewBox={`0 0 ${qrRender.size} ${qrRender.size}`}
                >
                  <Rect
                    x={0}
                    y={0}
                    width={qrRender.size}
                    height={qrRender.size}
                    fill="#FFFFFF"
                  />
                  <Path d={qrRender.darkPath} fill="#000000" />
                </Svg>
              </View>

              {isChunked ? (
                <>
                  <View style={styles.progressTrack}>
                    <View
                      style={[
                        styles.progressFill,
                        {
                          width: `${Math.max(0, Math.min(chunkProgress, 1)) * 100}%`,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.chunkHint}>
                    {t('deviceTransfer.shareChunkHint', {
                      defaultValue:
                        'Keep both devices steady. QR rotates automatically.',
                    })}
                  </Text>
                  <Text style={styles.chunkSubhint}>
                    {paused
                      ? t('deviceTransfer.chunkPaused', {
                          defaultValue: 'Rotation paused',
                        })
                      : t('deviceTransfer.chunkAutoRotating', {
                          defaultValue: 'Auto-rotating every 0.7s',
                        })}
                  </Text>
                  <View style={styles.controlsRow}>
                    <AnimatedPressable
                      style={styles.iconButton}
                      onPress={() =>
                        setActiveIndex((current) =>
                          totalPackets === 0
                            ? 0
                            : (current - 1 + totalPackets) % totalPackets,
                        )
                      }
                      testID={E2E_IDS.shareToDevice.previous}
                    >
                      <SkipBack size={16} color={tokens.colors.textPrimary} />
                    </AnimatedPressable>
                    <AnimatedPressable
                      style={styles.pauseButton}
                      onPress={() => setPaused((value) => !value)}
                      testID={E2E_IDS.shareToDevice.pause}
                    >
                      {paused ? (
                        <Play size={14} color={tokens.colors.textPrimary} />
                      ) : (
                        <Pause size={14} color={tokens.colors.textPrimary} />
                      )}
                      <Text style={styles.pauseButtonText}>
                        {paused
                          ? t('deviceTransfer.resumeRotation', {
                              defaultValue: 'Resume',
                            })
                          : t('deviceTransfer.pauseRotation', {
                              defaultValue: 'Pause',
                            })}
                      </Text>
                    </AnimatedPressable>
                    <AnimatedPressable
                      style={styles.iconButton}
                      onPress={() =>
                        setActiveIndex((current) =>
                          totalPackets === 0 ? 0 : (current + 1) % totalPackets,
                        )
                      }
                      testID={E2E_IDS.shareToDevice.next}
                    >
                      <SkipForward
                        size={16}
                        color={tokens.colors.textPrimary}
                      />
                    </AnimatedPressable>
                  </View>
                </>
              ) : null}
            </View>
          ) : (
            <ActivityIndicator color={tokens.colors.primary} />
          )}
        </View>
      </View>
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
      width: layout.isLandscape ? 560 : 480,
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
      flex: 1,
      padding: tokens.spacing.lg,
      paddingBottom: bottomInset + tokens.spacing.xxl,
      gap: tokens.spacing.md,
      alignSelf: 'center',
      width: '100%',
      maxWidth: layout.isLandscape ? 920 : 720,
    },
    leadRow: {
      flexDirection: 'row',
      gap: tokens.spacing.md,
      borderRadius: tokens.radius.lg,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      backgroundColor: tokens.colors.surfaceContainer,
      padding: tokens.spacing.md,
      alignItems: 'flex-start',
    },
    leadIcon: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: withAlpha(tokens.colors.primary, 0.14),
      alignItems: 'center',
      justifyContent: 'center',
    },
    leadText: {
      flex: 1,
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.body,
      lineHeight: 20,
    },
    qrCard: {
      flex: 1,
      width: '100%',
      borderRadius: tokens.radius.lg,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      backgroundColor: tokens.colors.surfaceContainerHigh,
      alignItems: 'center',
      justifyContent: 'center',
      padding: tokens.spacing.lg,
    },
    qrContent: {
      width: '100%',
      alignItems: 'center',
      gap: tokens.spacing.sm,
    },
    metaRow: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: tokens.spacing.xs,
    },
    modeBadge: {
      borderRadius: 999,
      paddingHorizontal: tokens.spacing.sm,
      minHeight: 26,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modeBadgeSingle: {
      backgroundColor: withAlpha(tokens.colors.primary, 0.1),
    },
    modeBadgeChunked: {
      backgroundColor: withAlpha(tokens.colors.accentWarning, 0.12),
    },
    modeBadgeText: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.label,
      fontWeight: '700',
    },
    metaCounter: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.label,
      fontWeight: '700',
    },
    qrImage: {
      width: 280,
      height: 280,
      borderRadius: tokens.radius.md,
      backgroundColor: '#FFFFFF',
    },
    progressTrack: {
      width: 280,
      height: 8,
      borderRadius: 999,
      overflow: 'hidden',
      backgroundColor: withAlpha(tokens.colors.outlineVariant, 0.45),
    },
    progressFill: {
      height: '100%',
      backgroundColor: tokens.colors.primary,
    },
    chunkHint: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.label,
      textAlign: 'center',
      lineHeight: 18,
      paddingHorizontal: tokens.spacing.sm,
    },
    chunkSubhint: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.label,
      textAlign: 'center',
      opacity: 0.8,
    },
    controlsRow: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: tokens.spacing.sm,
    },
    iconButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: tokens.colors.bgSurface,
    },
    pauseButton: {
      minHeight: 40,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: tokens.colors.outlineVariant,
      paddingHorizontal: tokens.spacing.lg,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: tokens.spacing.xs,
      backgroundColor: tokens.colors.bgSurface,
    },
    pauseButtonText: {
      color: tokens.colors.textPrimary,
      fontSize: tokens.type.label,
      fontWeight: '700',
    },
    errorText: {
      color: tokens.colors.accentDanger,
      fontSize: tokens.type.body,
      fontWeight: '700',
      textAlign: 'center',
    },
  });
}
