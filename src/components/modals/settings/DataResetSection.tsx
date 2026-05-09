import { AlertTriangle, RefreshCw } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { AnimatedPressable } from '../../../animation/primitives';
import type { ThemeTokens } from '../../../theme/tokens';
import type { SettingsStyles } from './SettingsModal.styles';

interface DataResetSectionProps {
  tokens: ThemeTokens;
  styles: SettingsStyles;
  onResetData: () => void;
}

export function DataResetSection({
  tokens,
  styles,
  onResetData,
}: DataResetSectionProps) {
  const { t } = useTranslation();

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <AlertTriangle size={16} color={tokens.colors.accentDanger} />
        <Text style={styles.sectionTitle}>{t('settings.data.title')}</Text>
      </View>
      <Text style={styles.rowSubtitle}>
        {t('settings.data.resetDescription')}
      </Text>
      <AnimatedPressable style={styles.resetButton} onPress={onResetData}>
        <RefreshCw size={18} color={tokens.colors.accentDanger} />
        <Text style={styles.resetButtonText}>
          {t('settings.data.resetButton')}
        </Text>
      </AnimatedPressable>
    </View>
  );
}
