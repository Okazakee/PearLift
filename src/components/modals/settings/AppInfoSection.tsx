import { Info } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import type { SettingsStyles } from '@/components/modals/settings/SettingsModal.styles';
import type { ThemeTokens } from '@/theme/tokens';

interface AppInfoSectionProps {
  tokens: ThemeTokens;
  styles: SettingsStyles;
  appName: string;
  appVersion: string;
  appBuild: string;
  buildType: string;
}

export function AppInfoSection({
  tokens,
  styles,
  appName,
  appVersion,
  appBuild,
  buildType,
}: AppInfoSectionProps) {
  const { t } = useTranslation();

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Info size={16} color={tokens.colors.primary} />
        <Text style={styles.sectionTitle}>{t('settings.appInfo.title')}</Text>
      </View>
      <View style={styles.infoRow}>
        <Text style={styles.infoLabel}>{t('settings.appInfo.name')}</Text>
        <Text style={styles.infoValue}>{appName}</Text>
      </View>
      <View style={styles.infoRow}>
        <Text style={styles.infoLabel}>{t('settings.appInfo.version')}</Text>
        <Text style={styles.infoValue}>{appVersion}</Text>
      </View>
      <View style={styles.infoRow}>
        <Text style={styles.infoLabel}>{t('settings.appInfo.build')}</Text>
        <Text style={styles.infoValue}>{appBuild}</Text>
      </View>
      <View style={styles.infoRowLast}>
        <Text style={styles.infoLabel}>{t('settings.appInfo.buildType')}</Text>
        <Text style={styles.infoValue}>{buildType}</Text>
      </View>
    </View>
  );
}
