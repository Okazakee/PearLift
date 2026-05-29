if (!output.syncInvite) {
  throw new Error('Missing sync invite output.');
}

console.log(`SYNC_INVITE=${output.syncInvite}`);
