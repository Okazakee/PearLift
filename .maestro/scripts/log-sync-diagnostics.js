if (!output.roomState) {
  throw new Error('Missing roomState output.');
}

if (!output.autobaseKey) {
  throw new Error('Missing autobaseKey output.');
}

console.log(
  JSON.stringify({
    type: 'SYNC_DIAGNOSTICS',
    status: output.status ?? '',
    syncMode: output.syncMode ?? '',
    syncRole: output.syncRole ?? '',
    deviceName: output.deviceName ?? '',
    roomState: output.roomState,
    firstSyncResolution: output.firstSyncResolution ?? '',
    connections: output.connections ?? '',
    pairedDevicesCount: output.pairedDevicesCount ?? '',
    pairedDeviceNames: output.pairedDeviceNames ?? '',
    pendingLocalSummary: output.pendingLocalSummary ?? '',
    pendingRemoteSummary: output.pendingRemoteSummary ?? '',
    autobaseKey: output.autobaseKey,
    topicHex: output.topicHex ?? '',
    lastError: output.lastError ?? '',
    recentLogKeys: output.recentLogKeys ?? '',
  }),
);
