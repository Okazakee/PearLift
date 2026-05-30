import { argv, exit } from 'node:process';
import DHT from 'hyperdht';

const port = Number(argv[2] ?? '54973');

const dht = new DHT({ port });
await dht.ready();

process.stdout.write(`DHT_BOOTSTRAP=localhost:${port}\n`);
// eslint-disable-next-line no-console
console.error(`DHT bootstrap listening on localhost:${port}`);

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    dht.destroy();
  } catch {
    /* ignore */
  }
  exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Keep alive
await new Promise(() => {});
