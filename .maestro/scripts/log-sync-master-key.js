if (!output.masterKey) {
  throw new Error('Missing sync master key output.');
}

console.log(`SYNC_MASTER_KEY=${output.masterKey}`);
