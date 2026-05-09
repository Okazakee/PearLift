export { computeImportDiff } from './diff';
export { parseAndMigrateBackup, parseBackupJson } from './migration';
export { serializePwaBackupV2, toPwaBackupV2 } from './serialization';

const LOCAL_STATE_SCHEMA_VERSION = 2;
export const LOCAL_STATE_STORAGE_KEY = `pearlift-local-backup-v${LOCAL_STATE_SCHEMA_VERSION}`;

export function getBackupFileName(date = new Date()) {
  const day = date.toISOString().split('T')[0];
  const hour = date
    .toISOString()
    .split('T')[1]
    .split(':')
    .slice(0, 2)
    .join('-');
  return `Pearlift_backup_${day}-${hour}.json`;
}
