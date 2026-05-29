if (!output.roomState) {
  throw new Error('Missing roomState output.');
}

if (!output.autobaseKey) {
  throw new Error('Missing autobaseKey output.');
}

console.log(
  JSON.stringify({
    type: 'SYNC_DIAGNOSTICS',
    roomState: output.roomState,
    firstSyncResolution: output.firstSyncResolution ?? '',
    pairedDeviceNames: output.pairedDeviceNames ?? '',
    autobaseKey: output.autobaseKey,
    topicHex: output.topicHex ?? '',
    lastError: output.lastError ?? '',
    recentLogKeys: output.recentLogKeys ?? '',
  }),
);
