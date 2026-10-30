export type Debounced<Args extends unknown[]> = {
  // Runs a pending call immediately and clears it; a no-op when nothing is
  // pending. Callers that might tear down mid-wait must call this so a
  // trailing call is not silently dropped.
  flush: () => void;
  // Drops a pending call without running it; a no-op when nothing is pending.
  cancel: () => void;
} & ((...args: Args) => void);

/**
 * Collapses rapid calls into a single trailing-edge call to `fn`, `wait` ms
 * after the last call. Each call restarts the wait and replaces the pending
 * arguments — only the most recent call's arguments are ever passed through.
 */
export function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  wait: number,
): Debounced<Args> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingArgs: Args | null = null;

  function run() {
    timer = null;

    let args = pendingArgs;

    pendingArgs = null;

    if (args !== null) {
      fn(...args);
    }
  }

  function debounced(...args: Args) {
    pendingArgs = args;

    if (timer !== null) {
      clearTimeout(timer);
    }

    timer = setTimeout(run, wait);
  }

  return Object.assign(debounced, {
    flush: () => {
      if (timer === null) {
        return;
      }

      clearTimeout(timer);
      run();
    },
    cancel: () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }

      pendingArgs = null;
    },
  });
}
