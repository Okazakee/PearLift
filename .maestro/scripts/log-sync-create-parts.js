if (!output.pairingSecret) {
  throw new Error('Missing sync pairing secret output.');
}

if (!output.bootstrapKey) {
  throw new Error('Missing sync bootstrap key output.');
}

console.log(`SYNC_PAIRING_SECRET=${output.pairingSecret}`);
console.log(`SYNC_BOOTSTRAP_KEY=${output.bootstrapKey}`);
