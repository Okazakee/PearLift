import { getOpPayload } from '@/sync/conflicts';
import type { SyncOpEnvelope, SyncSnapshotReplacePayload } from '@/sync/types';

export function getLatestSnapshotPayload(
  bufferedRemoteOps: SyncOpEnvelope[],
): {
  latestSnapshotOp: SyncOpEnvelope | undefined;
  remoteSnapshotPayload: SyncSnapshotReplacePayload | null;
} {
  const latestSnapshotOp = [...bufferedRemoteOps]
    .reverse()
    .find((op) => getOpPayload(op).kind === 'snapshot_replace');
  const remoteSnapshotPayload =
    latestSnapshotOp && getOpPayload(latestSnapshotOp).kind === 'snapshot_replace'
      ? (getOpPayload(latestSnapshotOp) as SyncSnapshotReplacePayload)
      : null;

  return {
    latestSnapshotOp,
    remoteSnapshotPayload,
  };
}

