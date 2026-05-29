import { Code, CodeXml } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { AnimatedPressable } from '@/animation/primitives';
import type { SettingsStyles } from '@/components/modals/settings/SettingsModal.styles';
import { E2E_IDS } from '@/config/testIds';
import type { ThemeTokens } from '@/theme/tokens';
import { Text } from '../../AppText';

interface DeveloperSectionProps {
  tokens: ThemeTokens;
  styles: SettingsStyles;
  onOpenGithub: () => void;
}

export function DeveloperSection({
  tokens,
  styles,
  onOpenGithub,
}: DeveloperSectionProps) {
  const { t } = useTranslation();

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Code size={16} color={tokens.colors.primary} />
        <Text style={styles.sectionTitle}>{t('settings.developer.title')}</Text>
      </View>
      <View style={styles.infoRowLast}>
        <Text style={styles.infoLabel}>
          {t('settings.developer.maintainer')}
        </Text>
        <Text style={styles.infoValue}>Okazakee</Text>
      </View>
      <View style={styles.developerButtons}>
        <AnimatedPressable
          style={styles.developerPrimaryButton}
          onPress={onOpenGithub}
          testID={E2E_IDS.settings.githubOpen}
        >
          <CodeXml size={18} color={tokens.colors.onPrimary} />
          <Text style={styles.githubButtonText}>
            {t('settings.developer.openRepo')}
          </Text>
        </AnimatedPressable>
      </View>
    </View>
  );
}
