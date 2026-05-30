export interface SyncDiagnosticsPayload {
  type: 'SYNC_DIAGNOSTICS';
  status?: string;
  syncMode?: string;
  syncRole?: string;
  deviceName?: string;
  roomState: string;
  firstSyncResolution?: string;
  connections?: string;
  pairedDevicesCount?: string;
  pairedDeviceNames?: string;
  pendingLocalSummary?: string;
  pendingRemoteSummary?: string;
  autobaseKey: string;
  topicHex?: string;
  lastError?: string;
  recentLogKeys?: string;
}

export function extractPairingSecret(text: string): string | null;
export function extractBootstrapKey(text: string): string | null;
export function encodeSyncInvite(
  pairingSecretHex: string,
  bootstrapKeyHex: string,
): string;
export function extractDiagnostics(text: string): SyncDiagnosticsPayload | null;
