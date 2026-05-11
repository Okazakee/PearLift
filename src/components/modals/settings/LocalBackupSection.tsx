import { HardDrive, QrCode } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { AnimatedPressable } from '@/animation/primitives';
import type { SettingsStyles } from '@/components/modals/settings/SettingsModal.styles';
import type { ThemeTokens } from '@/theme/tokens';

interface LocalBackupSectionProps {
  tokens: ThemeTokens;
  styles: SettingsStyles;
  onOpenLocalBackup: () => void;
  onOpenQRBackup: () => void;
}

export function LocalBackupSection({
  tokens,
  styles,
  onOpenLocalBackup,
  onOpenQRBackup,
}: LocalBackupSectionProps) {
  const { t } = useTranslation();

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <HardDrive size={16} color={tokens.colors.primary} />
        <Text style={styles.sectionTitle}>
          {t('settings.localBackup.title')}
        </Text>
      </View>
      <View style={styles.backupGrid}>
        <AnimatedPressable
          style={[styles.outlineButton, styles.backupButton]}
          onPress={onOpenLocalBackup}
        >
          <HardDrive size={15} color={tokens.colors.textSecondary} />
          <Text style={styles.outlineButtonText}>
            {t('settings.localBackup.localSaveRestore')}
          </Text>
        </AnimatedPressable>
        <AnimatedPressable
          style={[styles.outlineButton, styles.backupButton]}
          onPress={onOpenQRBackup}
        >
          <QrCode size={15} color={tokens.colors.textSecondary} />
          <Text style={styles.outlineButtonText}>
            {t('settings.localBackup.qrShareRestore')}
          </Text>
        </AnimatedPressable>
      </View>
    </View>
  );
}
