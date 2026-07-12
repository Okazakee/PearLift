import { Image } from 'expo-image';
import { Layers3, Settings } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { E2E_IDS } from '@/config/testIds';
import type { SyncHealth } from '@/sync/types';
import type { ThemeTokens } from '@/theme/tokens';
import type { TrainingProgram } from '@/types';
import { formatFrequencySummarySummary } from '@/utils/program';
import { Text } from './AppText';

interface HeaderProps {
  tokens: ThemeTokens;
  topInset: number;
  maxWidth?: number;
  program?: TrainingProgram | null;
  showProgramLibraryAction?: boolean;
  syncHealth?: SyncHealth | null;
  onOpenProgramLibrary?: () => void;
  onOpenSettings: () => void;
  onOpenSyncQuickInfo?: () => void;
}

export function Header({
  tokens,
  topInset,
  maxWidth,
  program,
  showProgramLibraryAction = false,
  syncHealth,
  onOpenProgramLibrary,
  onOpenSettings,
  onOpenSyncQuickInfo,
}: HeaderProps) {
  const { t } = useTranslation();
  const styles = createStyles(tokens, topInset, maxWidth);
  const frequencySummary = formatFrequencySummarySummary(
    program?.frequencySummary,
  );

  const statusTone =
    syncHealth?.status === 'synced'
      ? tokens.colors.primary
      : syncHealth?.status === 'connecting' ||
          syncHealth?.status === 'dht_ready' ||
          syncHealth?.status === 'peer_connected' ||
          syncHealth?.status === 'handshake_ok' ||
          syncHealth?.status === 'replicating'
        ? tokens.colors.accentWarning
        : syncHealth?.status === 'error'
          ? tokens.colors.accentDanger
          : syncHealth?.status === 'waiting'
            ? tokens.colors.textSecondary
            : tokens.colors.textSecondary;

  return (
    <View style={styles.container}>
      <View style={styles.inner}>
        <View style={styles.brandRow}>
          <View style={styles.logoBadge}>
            <Image
              source={require('../../assets/pearlift_transparent.png')}
              style={styles.logoImage}
              contentFit="contain"
            />
          </View>
          <View>
            <Text style={styles.title}>PearLift</Text>
            {program &&
            (program.name !== 'Main Program' ||
              !!program.subtitle ||
              !!program.goal) ? (
              <Text style={styles.programLine}>
                {program.subtitle
                  ? `${program.name} · ${program.subtitle}`
                  : program.name}
              </Text>
            ) : null}
            {frequencySummary ? (
              <Text style={styles.targetsLine}>
                {t('programSettings.program.frequencySummary')}:{' '}
                {frequencySummary}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.actionsRow}>
          {showProgramLibraryAction && onOpenProgramLibrary ? (
            <Pressable onPress={onOpenProgramLibrary} style={styles.iconButton}>
              <Layers3 size={18} color={tokens.colors.textSecondary} />
            </Pressable>
          ) : null}
          {syncHealth ? (
            <Pressable
              onPress={onOpenSyncQuickInfo ?? onOpenSettings}
              style={styles.syncDotButton}
              testID={E2E_IDS.header.syncStatusOpen}
            >
              <View style={[styles.syncDot, { backgroundColor: statusTone }]} />
            </Pressable>
          ) : null}
          <Pressable
            onPress={onOpenSettings}
            style={styles.iconButton}
            testID={E2E_IDS.header.settingsOpen}
          >
            <Settings size={18} color={tokens.colors.textSecondary} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function createStyles(
  tokens: ThemeTokens,
  topInset: number,
  maxWidth?: number,
) {
  return StyleSheet.create({
    container: {
      paddingTop: topInset + tokens.spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: tokens.colors.borderSubtle,
      backgroundColor: tokens.colors.background,
    },
    inner: {
      width: '100%',
      maxWidth,
      alignSelf: 'center',
      paddingHorizontal: tokens.spacing.lg,
      paddingBottom: tokens.spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    brandRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: tokens.spacing.sm,
    },
    logoBadge: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: tokens.colors.primaryContainer,
      alignItems: 'center',
      justifyContent: 'center',
    },
    logoImage: {
      width: 24,
      height: 24,
    },
    title: {
      color: tokens.colors.textPrimary,
      fontSize: 18,
      fontWeight: '700',
      lineHeight: 22,
    },
    programLine: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.label,
      fontWeight: '600',
      lineHeight: 18,
      marginTop: 1,
    },
    targetsLine: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.type.label - 1,
      fontWeight: '500',
      lineHeight: 16,
      marginTop: 2,
      maxWidth: 240,
    },
    actionsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: tokens.spacing.xs,
    },
    iconButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: tokens.colors.bgSurface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    syncDotButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: tokens.colors.bgSurface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    syncDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
    },
  });
}
