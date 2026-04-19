type IdleCallbackHandle = number;

type IdleDeadlineLike = {
  didTimeout: boolean;
  timeRemaining: () => number;
};

type RequestIdleCallbackLike = (
  callback: (deadline: IdleDeadlineLike) => void,
) => IdleCallbackHandle;

type CancelIdleCallbackLike = (handle: IdleCallbackHandle) => void;

function hasRequestIdleCallback(): boolean {
  return typeof globalThis.requestIdleCallback === 'function';
}

function hasCancelIdleCallback(): boolean {
  return typeof globalThis.cancelIdleCallback === 'function';
}

export function scheduleIdleTask(task: () => void): () => void {
  if (hasRequestIdleCallback()) {
    const requestIdle =
      globalThis.requestIdleCallback as RequestIdleCallbackLike;
    const cancelIdle = hasCancelIdleCallback()
      ? (globalThis.cancelIdleCallback as CancelIdleCallbackLike)
      : undefined;
    const handle = requestIdle(() => task());
    return () => {
      if (cancelIdle) {
        cancelIdle(handle);
      }
    };
  }

  const timeout = setTimeout(task, 0);
  return () => clearTimeout(timeout);
}
