export class KeyedSerialExecutor {
  private readonly tails = new Map<string, Promise<void>>();

  runMany<T>(keys: string[], operation: () => Promise<T>): Promise<T> {
    const orderedKeys = [...new Set(keys)].sort();
    const acquire = (index: number): Promise<T> => {
      const key = orderedKeys[index];
      if (key === undefined) return operation();
      return this.run(key, () => acquire(index + 1));
    };
    return acquire(0);
  }

  async run<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    let release: (() => void) | undefined;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => current);
    this.tails.set(key, tail);

    await previous;
    try {
      return await operation();
    } finally {
      release?.();
      if (this.tails.get(key) === tail) {
        this.tails.delete(key);
      }
    }
  }
}
