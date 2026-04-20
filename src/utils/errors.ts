export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown error';
  }
}

export function logError(scope: string, error: unknown): void {
  // eslint-disable-next-line no-console
  console.error(`[${scope}]`, error);
}
