/**
 * Keyed async mutex lock to serialize operations per kit,
 * preventing race-condition double bookings under concurrent load.
 */
class AsyncLock {
  private queues = new Map<string, Promise<void>>();

  async acquire<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const currentQueue = this.queues.get(key) || Promise.resolve();

    let release: () => void = () => {};
    const nextQueue = new Promise<void>((resolve) => {
      release = resolve;
    });

    // Chain the new task after the current queue
    this.queues.set(key, currentQueue.then(() => nextQueue));

    try {
      await currentQueue;
      return await fn();
    } finally {
      release();
      if (this.queues.get(key) === currentQueue) {
        this.queues.delete(key);
      }
    }
  }
}

export const kitLock = new AsyncLock();
