import { RestTimerForegroundService as Native } from 'pearlift-rest-timer-fgs';
import { Platform } from 'react-native';

export type RestTimerForegroundServiceState = Awaited<
  ReturnType<NonNullable<typeof Native>['getState']>
>;

function getNative() {
  if (Platform.OS !== 'android') return null;
  return Native;
}

export const RestTimerForegroundService = {
  isAvailable() {
    return !!getNative();
  },
  start(endAtMs: number, startedDurationSec: number) {
    const native = getNative();
    if (!native) return Promise.resolve();
    return native.start(endAtMs, startedDurationSec);
  },
  stop() {
    const native = getNative();
    if (!native) return Promise.resolve();
    return native.stop();
  },
  cancel() {
    const native = getNative();
    if (!native) return Promise.resolve();
    return native.cancel();
  },
  async getState() {
    const native = getNative();
    if (!native) return null;
    return await native.getState();
  },
  clearCompletion() {
    const native = getNative();
    if (!native) return Promise.resolve();
    return native.clearCompletion();
  },
};
