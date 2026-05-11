import { Shield } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { AnimatedPressable } from '@/animation/primitives';
import type { SettingsStyles } from '@/components/modals/settings/SettingsModal.styles';
import type { ThemeTokens } from '@/theme/tokens';
import { withAlpha } from '@/theme/tokens';

interface SyncBackupSectionProps {
  tokens: ThemeTokens;
  styles: SettingsStyles;
  syncEnabled: boolean;
  syncLastSyncedAt: string | null;
  onOpenSync: () => void;
}

export function SyncBackupSection({
  tokens,
  styles,
  syncEnabled,
  syncLastSyncedAt,
  onOpenSync,
}: SyncBackupSectionProps) {
  const { t } = useTranslation();

  const statusColor = syncEnabled
    ? tokens.colors.primary
    : tokens.colors.textSecondary;

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
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: statusColor,
              }}
            />
            <Text style={styles.rowTitle}>
              {syncEnabled
                ? t('settings.syncStatus.enabled')
                : t('settings.syncStatus.disabled')}
            </Text>
          </View>
          {syncEnabled && syncLastSyncedAt ? (
            <Text style={styles.rowSubtitle}>
              {t('settings.syncStatus.lastSuccessfulSync', {
                at: new Date(syncLastSyncedAt).toLocaleString(),
              })}
            </Text>
          ) : null}
        </View>
        <AnimatedPressable
          style={[
            styles.outlineButton,
            {
              minWidth: 120,
              flex: 0,
              borderColor: withAlpha(statusColor, 0.35),
            },
          ]}
          onPress={onOpenSync}
        >
          <Text style={[styles.outlineButtonText, { color: statusColor }]}>
            {t('settings.syncStatus.manage')}
          </Text>
        </AnimatedPressable>
      </View>
    </View>
  );
}
