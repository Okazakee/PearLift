export { computeImportDiff } from '@/backup/diff';
export { parseAndMigrateBackup, parseBackupJson } from '@/backup/migration';
export { serializePwaBackupV2, toPwaBackupV2 } from '@/backup/serialization';

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
