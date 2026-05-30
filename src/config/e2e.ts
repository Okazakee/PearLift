export const IS_E2E = process.env.EXPO_PUBLIC_PEARLIFT_E2E === '1';

export const E2E_DHT_BOOTSTRAP_HOST =
  process.env.EXPO_PUBLIC_E2E_DHT_BOOTSTRAP_HOST ?? '10.0.2.2';

export const E2E_DHT_BOOTSTRAP_PORT = Number(
  process.env.EXPO_PUBLIC_E2E_DHT_BOOTSTRAP_PORT ?? '0',
);

export function getE2EDhtBootstrap(): { host: string; port: number } | null {
  if (!IS_E2E) return null;
  if (E2E_DHT_BOOTSTRAP_PORT <= 0) return null;
  return { host: E2E_DHT_BOOTSTRAP_HOST, port: E2E_DHT_BOOTSTRAP_PORT };
}
