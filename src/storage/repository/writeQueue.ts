export class WriteQueue {
  private queue: Promise<void> = Promise.resolve();

  async drain(): Promise<void> {
    await this.queue;
  }

  enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.then(
      () => undefined,
      (err: unknown) => {
        // eslint-disable-next-line no-console
        console.error('[WorkoutRepository] Write queue error:', err);
        return undefined;
      },
    );
    return run;
  }
}
