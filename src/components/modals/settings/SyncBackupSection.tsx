import { Shield } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { AnimatedPressable } from '@/animation/primitives';
import type { SettingsStyles } from '@/components/modals/settings/SettingsModal.styles';
import type { ThemeTokens } from '@/theme/tokens';

interface SyncBackupSectionProps {
  tokens: ThemeTokens;
  styles: SettingsStyles;
  syncEnabled: boolean;
  syncPeers: number;
  syncLastSyncedAt: string | null;
  onOpenSync: () => void;
}

export function SyncBackupSection({
  tokens,
  styles,
  syncEnabled,
  syncPeers,
  syncLastSyncedAt,
  onOpenSync,
}: SyncBackupSectionProps) {
  const { t } = useTranslation();

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Shield size={16} color={tokens.colors.primary} />
        <Text style={styles.sectionTitle}>
          {t('settings.syncBackup.title')}
        </Text>
      </View>
      <View style={styles.row}>
        <View style={styles.rowText}>
          <Text style={styles.rowTitle}>
            {syncEnabled
              ? t('settings.syncStatus.enabled')
              : t('settings.syncStatus.disabled')}
          </Text>
          <Text style={styles.rowSubtitle}>
            {syncEnabled
              ? t('settings.syncStatus.syncingWith', {
                  count: Math.max(syncPeers, 0),
                })
              : t('settings.syncStatus.off')}
          </Text>
          <Text style={styles.rowSubtitle}>
            {syncLastSyncedAt
              ? t('settings.syncStatus.lastSuccessfulSync', {
                  at: new Date(syncLastSyncedAt).toLocaleString(),
                })
              : t('sync.quick.lastSyncNever')}
          </Text>
        </View>
      </View>
      <AnimatedPressable style={styles.outlineButton} onPress={onOpenSync}>
        <Shield size={15} color={tokens.colors.textSecondary} />
        <Text style={styles.outlineButtonText}>
          {t('settings.syncBackup.openSyncSetup')}
        </Text>
      </AnimatedPressable>
    </View>
  );
}
