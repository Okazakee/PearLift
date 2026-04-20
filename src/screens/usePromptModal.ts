import { useCallback, useState } from 'react';
import type { AppPromptAction } from '../components/modals/AppPromptModal';

interface PromptConfig {
  title: string;
  message: string;
  actions: AppPromptAction[];
}

export function usePromptModal() {
  const [promptConfig, setPromptConfig] = useState<PromptConfig | null>(null);

  const showPrompt = useCallback(
    (title: string, message: string, actions?: AppPromptAction[]) => {
      setPromptConfig({
        title,
        message,
        actions: actions ?? [{ label: 'OK' }],
      });
    },
    [],
  );

  const closePrompt = useCallback(() => {
    setPromptConfig(null);
  }, []);

  return { promptConfig, showPrompt, closePrompt };
}
