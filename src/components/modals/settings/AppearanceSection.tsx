import { Sun } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { AnimatedPressable } from '../../../animation/primitives';
import { getLanguageNativeName } from '../../../storage/workoutRepository';
import type { ThemePreference, ThemeTokens } from '../../../theme/tokens';
import type { WeightUnit } from '../../../types';
import type { SettingsStyles } from './SettingsModal.styles';

interface AppearanceSectionProps {
  tokens: ThemeTokens;
  styles: SettingsStyles;
  themePreference: ThemePreference;
  onThemePreferenceChange: (next: ThemePreference) => void;
  weightUnit: WeightUnit;
  onWeightUnitChange: (next: WeightUnit) => void;
  language: string;
  onLanguageChange: (next: string) => void;
  onLanguageListOpen: () => void;
}

export function AppearanceSection({
  tokens,
  styles,
  themePreference,
  onThemePreferenceChange,
  weightUnit,
  onWeightUnitChange,
  language,
  onLanguageChange,
  onLanguageListOpen,
}: AppearanceSectionProps) {
  const { t } = useTranslation();

  const themeOptionStyle = (value: ThemePreference) => {
    const selected = themePreference === value;
    if (!selected) return styles.segment;
    return [styles.segment, styles.segmentSelected];
  };

  const themeOptionTextStyle = (value: ThemePreference) => {
    const selected = themePreference === value;
    if (!selected) return styles.segmentText;
    return [styles.segmentText, styles.segmentTextSelected];
  };

  const unitOptionStyle = (value: WeightUnit) => {
    const selected = weightUnit === value;
    if (!selected) return styles.segment;
    return [styles.segment, styles.segmentSelected];
  };

  const unitOptionTextStyle = (value: WeightUnit) => {
    const selected = weightUnit === value;
    if (!selected) return styles.segmentText;
    return [styles.segmentText, styles.segmentTextSelected];
  };

  const languageOptionStyle = (value: string) => {
    const selected =
      language === value || (value === 'manual' && language !== 'system');
    if (!selected) return styles.segment;
    return [styles.segment, styles.segmentSelected];
  };

  const languageOptionTextStyle = (value: string) => {
    const selected =
      language === value || (value === 'manual' && language !== 'system');
    if (!selected) return styles.segmentText;
    return [styles.segmentText, styles.segmentTextSelected];
  };

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Sun size={16} color={tokens.colors.primary} />
        <Text style={styles.sectionTitle}>
          {t('settings.appearance.title')}
        </Text>
      </View>
      <View style={styles.row}>
        <View style={styles.rowText}>
          <Text style={styles.rowTitle}>{t('settings.appearance.theme')}</Text>
          <Text style={styles.rowSubtitle}>
            {t('settings.appearance.themeSubtitle')}
          </Text>
        </View>
        <View style={styles.segmented}>
          <AnimatedPressable
            style={themeOptionStyle('system')}
            onPress={() => onThemePreferenceChange('system')}
          >
            <Text style={themeOptionTextStyle('system')}>
              {t('settings.appearance.themeSystem')}
            </Text>
          </AnimatedPressable>
          <AnimatedPressable
            style={themeOptionStyle('light')}
            onPress={() => onThemePreferenceChange('light')}
          >
            <Text style={themeOptionTextStyle('light')}>
              {t('settings.appearance.themeLight')}
            </Text>
          </AnimatedPressable>
          <AnimatedPressable
            style={themeOptionStyle('dark')}
            onPress={() => onThemePreferenceChange('dark')}
          >
            <Text style={themeOptionTextStyle('dark')}>
              {t('settings.appearance.themeDark')}
            </Text>
          </AnimatedPressable>
        </View>
      </View>

      <View style={styles.row}>
        <View style={styles.rowText}>
          <Text style={styles.rowTitle}>
            {t('settings.appearance.weightUnit')}
          </Text>
          <Text style={styles.rowSubtitle}>
            {t('settings.appearance.weightUnitSubtitle')}
          </Text>
        </View>
        <View style={styles.segmented}>
          <AnimatedPressable
            style={unitOptionStyle('kg')}
            onPress={() => onWeightUnitChange('kg')}
          >
            <Text style={unitOptionTextStyle('kg')}>kg</Text>
          </AnimatedPressable>
          <AnimatedPressable
            style={unitOptionStyle('lb')}
            onPress={() => onWeightUnitChange('lb')}
          >
            <Text style={unitOptionTextStyle('lb')}>lb</Text>
          </AnimatedPressable>
        </View>
      </View>

      <View style={styles.row}>
        <View style={styles.rowText}>
          <Text style={styles.rowTitle}>
            {t('settings.appearance.language')}
          </Text>
        </View>
        <View style={styles.segmented}>
          <AnimatedPressable
            style={languageOptionStyle('system')}
            onPress={() => onLanguageChange('system')}
          >
            <Text style={languageOptionTextStyle('system')}>
              {t('settings.appearance.system')}
            </Text>
          </AnimatedPressable>
          <AnimatedPressable
            style={languageOptionStyle(
              language === 'system' ? 'manual' : language,
            )}
            onPress={onLanguageListOpen}
          >
            <Text
              style={languageOptionTextStyle(
                language === 'system' ? 'manual' : language,
              )}
            >
              {language === 'system'
                ? t('settings.appearance.manual')
                : getLanguageNativeName(language)}
            </Text>
          </AnimatedPressable>
        </View>
      </View>
    </View>
  );
}
