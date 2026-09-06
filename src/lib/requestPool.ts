/** Shared bounded queue: foreground image fallbacks join background requests. */
export function createRequestPool(concurrency: number) {
  const pending = new Map<string, Promise<unknown>>();
  const queue: Array<() => void> = [];
  let running = 0;
  const drain = () => {
    while (running < Math.max(1, concurrency) && queue.length) queue.shift()!();
  };
  return <T>(key: string, task: () => Promise<T>): Promise<T> => {
    const existing = pending.get(key);
    if (existing) return existing as Promise<T>;
    const request = new Promise<T>((resolve, reject) => {
      queue.push(() => {
        running += 1;
        void Promise.resolve().then(task).then(resolve, reject).finally(() => {
          running -= 1;
          pending.delete(key);
          drain();
        });
      });
    });
    pending.set(key, request);
    drain();
    return request;
  };
}
export const steamDetailsRequest = createRequestPool(2);
