import { Database, HardDrive, QrCode, RefreshCw } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { AnimatedPressable } from '@/animation/primitives';
import type { SettingsStyles } from '@/components/modals/settings/SettingsModal.styles';
import type { ThemeTokens } from '@/theme/tokens';
import { Text } from '../../AppText';

interface DataSectionProps {
  tokens: ThemeTokens;
  styles: SettingsStyles;
  onOpenLocalBackup: () => void;
  onOpenQRBackup: () => void;
  onResetData: () => void;
}

export function DataSection({
  tokens,
  styles,
  onOpenLocalBackup,
  onOpenQRBackup,
  onResetData,
}: DataSectionProps) {
  const { t } = useTranslation();

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Database size={16} color={tokens.colors.primary} />
        <Text style={styles.sectionTitle}>{t('settings.data.title')}</Text>
      </View>

      <AnimatedPressable
        style={[styles.outlineButton, { width: '100%' }]}
        onPress={onOpenLocalBackup}
      >
        <HardDrive size={15} color={tokens.colors.textSecondary} />
        <Text style={styles.outlineButtonText}>
          {t('settings.localBackup.localSaveRestore')}
        </Text>
      </AnimatedPressable>

      <AnimatedPressable
        style={[styles.outlineButton, { width: '100%' }]}
        onPress={onOpenQRBackup}
      >
        <QrCode size={15} color={tokens.colors.textSecondary} />
        <Text style={styles.outlineButtonText}>
          {t('settings.localBackup.qrShareRestore')}
        </Text>
      </AnimatedPressable>

      <AnimatedPressable style={styles.resetButton} onPress={onResetData}>
        <RefreshCw size={18} color={tokens.colors.accentDanger} />
        <Text style={styles.resetButtonText}>
          {t('settings.data.resetButton')}
        </Text>
      </AnimatedPressable>
    </View>
  );
}
