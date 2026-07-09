export interface RunToken {
  readonly signal: AbortSignal;
  /** Waits for any previously stopped run to settle before work begins. */
  readonly ready: Promise<void>;
}

export interface RunGate {
  readonly running: boolean;
  start: () => RunToken | null;
  stop: () => void;
  isCurrent: (token: RunToken) => boolean;
  finish: (token: RunToken) => boolean;
}

/**
 * Owns one replaceable async run.
 *
 * Stopping a run invalidates its token immediately, so a later start cannot
 * accidentally reactivate work that is still awaiting a timer or IPC call.
 */
export function createRunGate(): RunGate {
  interface InternalRunToken extends RunToken {
    controller: AbortController;
    settle: () => void;
    settled: boolean;
  }

  let current: InternalRunToken | null = null;
  let previousCompletion = Promise.resolve();

  return {
    get running() {
      return current !== null && !current.controller.signal.aborted;
    },
    start() {
      if (current !== null && !current.controller.signal.aborted) return null;
      const controller = new AbortController();
      let settle = () => {};
      const completion = new Promise<void>((resolve) => {
        settle = resolve;
      });
      const token: InternalRunToken = {
        controller,
        signal: controller.signal,
        ready: previousCompletion,
        settle,
        settled: false,
      };
      previousCompletion = completion;
      current = token;
      return token;
    },
    stop() {
      current?.controller.abort();
      current = null;
    },
    isCurrent(token) {
      return current === token && !token.signal.aborted;
    },
    finish(token) {
      const internal = token as InternalRunToken;
      if (!internal.settled) {
        internal.settled = true;
        internal.settle();
      }
      if (current !== internal || token.signal.aborted) return false;
      current = null;
      return true;
    },
  };
}

/** Resolves false as soon as the owning run is stopped. */
export function abortableDelay(ms: number, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false);

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve(true);
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve(false);
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
