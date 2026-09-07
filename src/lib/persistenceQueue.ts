type Waiter = { resolve: () => void; reject: (error: unknown) => void };
type Write = { serialize: () => string; write: (data: string) => Promise<unknown>; waiters: Waiter[] };
type Queue = { pending?: Write; running?: Promise<void>; timer?: ReturnType<typeof setTimeout>; failed?: { error: unknown } };
const queues = new Map<string, Queue>();

function drain(queue: Queue): Promise<void> {
  if (queue.timer) { clearTimeout(queue.timer); queue.timer = undefined; }
  if (queue.running) return queue.running;
  // Install the running promise before invoking user code, including synchronous mocks.
  queue.running = Promise.resolve().then(async () => {
    while (queue.pending) {
      const job = queue.pending;
      queue.pending = undefined;
      try {
        await job.write(job.serialize());
        queue.failed = undefined;
        job.waiters.forEach(({ resolve }) => resolve());
      } catch (error) {
        queue.failed = { error };
        job.waiters.forEach(({ reject }) => reject(error));
      }
    }
  }).finally(() => {
    queue.running = undefined;
    if (queue.pending) void drain(queue);
  });
  return queue.running;
}

/** Serializes writes per file and coalesces only snapshots not yet being written. */
export function enqueuePersistence(key: string, serialize: () => string,
  write: (data: string) => Promise<unknown>, delayMs = 0): Promise<void> {
  if (transaction) {
    // Staged calls resolve after the transaction has synchronously accepted the
    // data. Durable completion remains observable through flushPersistence().
    transaction.push(() => { void enqueuePersistence(key, serialize, write, delayMs).catch(() => {}); });
    return Promise.resolve();
  }
  let queue = queues.get(key);
  if (!queue) { queue = {}; queues.set(key, queue); }
  const target = queue;
  const done = new Promise<void>((resolve, reject) => {
    const waiters = target.pending?.waiters ?? [];
    waiters.push({ resolve, reject });
    target.pending = { serialize, write, waiters };
  });
  if (!target.running && !target.timer) {
    if (delayMs > 0) target.timer = setTimeout(() => { void drain(target); }, delayMs);
    else void drain(target);
  }
  return done;
}
export async function flushPersistence(key?: string): Promise<void> {
  const selected = key === undefined ? [...queues.values()] : [queues.get(key)].filter((q): q is Queue => !!q);
  await Promise.all(selected.map(async (queue) => {
    do { await drain(queue); } while (queue.pending || queue.running);
    if (queue.failed) throw queue.failed.error;
  }));
  if (key === undefined && [...queues.values()].some((queue) => queue.pending || queue.running || queue.timer)) await flushPersistence();
}

let transaction: Array<() => void> | null = null;
/** Stage writes until a synchronous multi-store change has completed. */
export function withPersistenceTransaction<T>(operation: () => T): T {
  if (transaction) return operation();
  const staged: Array<() => void> = [];
  transaction = staged;
  try {
    const result = operation();
    transaction = null;
    for (const commit of staged) commit();
    return result;
  } catch (error) {
    transaction = null;
    // A rejected transaction has no disk changes to flush.
    throw error;
  }
}
