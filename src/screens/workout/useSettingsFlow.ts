import * as LocalAuthentication from 'expo-local-authentication';
import { useTranslation } from 'react-i18next';
import { Linking } from 'react-native';
import { APP_CONFIG } from '@/config/app';
import { IS_E2E } from '@/config/e2e';
import i18n from '@/i18n';
import { applyWorkoutMutation, showPrompt } from '@/screens/workout/services';
import { useWorkoutUiStore } from '@/store/workoutUiStore';
import type { ThemePreference } from '@/theme/tokens';
import type { WeightUnit } from '@/types';
import { getErrorMessage, logError } from '@/utils/errors';

export function useSettingsFlow(systemLanguage: string) {
  const { t } = useTranslation();
  const ui = useWorkoutUiStore();

  const handleResetData = () => {
    showPrompt(
      t('prompts.resetAllData.title'),
      t('prompts.resetAllData.message'),
      [
        { label: t('common.cancel'), tone: 'cancel' },
        {
          label: t('prompts.resetAllData.actions.confirm'),
          tone: 'destructive',
          onPress: () => {
            ui.setSettingsOpen(false);
            void (async () => {
              try {
                if (!IS_E2E) {
                  const enrolledLevel =
                    await LocalAuthentication.getEnrolledLevelAsync();
                  if (
                    enrolledLevel !== LocalAuthentication.SecurityLevel.NONE
                  ) {
                    const result = await LocalAuthentication.authenticateAsync({
                      promptMessage: t(
                        'prompts.resetAllData.authPromptMessage',
                      ),
                      cancelLabel: t('common.cancel'),
                      disableDeviceFallback: false,
                    });

                    if (!result.success) {
                      showPrompt(
                        t('prompts.resetAllData.canceledTitle'),
                        t('prompts.resetAllData.canceledMessage'),
                      );
                      return;
                    }
                  }
                }
                await applyWorkoutMutation({ type: 'resetAllData' });
              } catch (error) {
                logError('reset/authentication failed', error);
                showPrompt(
                  t('prompts.resetAllData.failedTitle'),
                  getErrorMessage(error),
                );
              }
            })();
          },
        },
      ],
    );
  };

  return {
    handleThemeModeChange: (nextTheme: ThemePreference) => {
      void applyWorkoutMutation({ type: 'setThemeMode', themeMode: nextTheme });
    },
    handleWeightUnitChange: (nextUnit: WeightUnit) => {
      void applyWorkoutMutation({
        type: 'setWeightUnit',
        weightUnit: nextUnit,
      });
    },
    handleLanguageChange: (nextLanguage: string) => {
      if (nextLanguage === 'system') {
        i18n.changeLanguage(systemLanguage);
        void applyWorkoutMutation({ type: 'setLanguage', language: 'system' });
        return;
      }

      i18n.changeLanguage(nextLanguage);
      void applyWorkoutMutation({
        type: 'setLanguage',
        language: nextLanguage,
      });
    },
    handleResetData,
    handleOpenGithub: async () => {
      const repoUrl = APP_CONFIG.githubRepoUrl;
      try {
        const canOpen = await Linking.canOpenURL(repoUrl);
        if (!canOpen) {
          showPrompt(t('prompts.openLink.cannotOpenLinkTitle'), repoUrl);
          return;
        }
        await Linking.openURL(repoUrl);
      } catch (error) {
        showPrompt(
          t('prompts.openLink.cannotOpenLinkTitle'),
          getErrorMessage(error),
        );
      }
    },
  };
}
