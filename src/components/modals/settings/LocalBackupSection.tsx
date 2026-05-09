import { Download, ScanLine, Share2, Upload } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { AnimatedPressable } from '../../../animation/primitives';
import type { ThemeTokens } from '../../../theme/tokens';
import type { SettingsStyles } from './SettingsModal.styles';

interface LocalBackupSectionProps {
  tokens: ThemeTokens;
  styles: SettingsStyles;
  onExportLocalBackup: () => void;
  onImportLocalBackup: () => void;
  onShareToDevice: () => void;
  onScanFromDevice: () => void;
}

export function LocalBackupSection({
  tokens,
  styles,
  onExportLocalBackup,
  onImportLocalBackup,
  onShareToDevice,
  onScanFromDevice,
}: LocalBackupSectionProps) {
  const { t } = useTranslation();

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Download size={16} color={tokens.colors.primary} />
        <Text style={styles.sectionTitle}>
          {t('settings.localBackup.title')}
        </Text>
      </View>
      <Text style={styles.rowSubtitle}>
        {t('backup.localJson.description')}
      </Text>
      <View style={styles.backupGrid}>
        <AnimatedPressable
          style={[styles.outlineButton, styles.backupButton]}
          onPress={onExportLocalBackup}
        >
          <Download size={15} color={tokens.colors.textSecondary} />
          <Text style={styles.outlineButtonText}>
            {t('settings.localBackup.export')}
          </Text>
        </AnimatedPressable>
        <AnimatedPressable
          style={[styles.outlineButton, styles.backupButton]}
          onPress={onImportLocalBackup}
        >
          <Upload size={15} color={tokens.colors.textSecondary} />
          <Text style={styles.outlineButtonText}>
            {t('settings.localBackup.import')}
          </Text>
        </AnimatedPressable>
        <AnimatedPressable
          style={[styles.outlineButton, styles.backupButton]}
          onPress={onShareToDevice}
        >
          <Share2 size={15} color={tokens.colors.textSecondary} />
          <Text style={styles.outlineButtonText}>
            {t('settings.localBackup.shareToDevice')}
          </Text>
        </AnimatedPressable>
        <AnimatedPressable
          style={[styles.outlineButton, styles.backupButton]}
          onPress={onScanFromDevice}
        >
          <ScanLine size={15} color={tokens.colors.textSecondary} />
          <Text style={styles.outlineButtonText}>
            {t('settings.localBackup.scanFromDevice')}
          </Text>
        </AnimatedPressable>
      </View>
    </View>
  );
}
