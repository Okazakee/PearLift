export function classifyStartError(message: string): {
  category: 'timeout' | 'validation' | 'runtime';
  userMessage: string;
} {
  const category = message.includes('worklet_start_timeout')
    ? 'timeout'
    : message.includes('validation') || message.includes('mismatch')
      ? 'validation'
      : 'runtime';

  return {
    category,
    userMessage:
      category === 'timeout'
        ? 'Sync startup timed out. Retry to reconnect.'
        : category === 'validation'
          ? message
          : `Sync start failed: ${message}`,
  };
}
