/**
 * Obsidian's requestUrl() has no built-in timeout or abort support, so a
 * stalled connection (dead Wi-Fi, a hung reverse proxy, ...) leaves the
 * caller waiting forever — visible to the user as a popover stuck on
 * "Loading…" with no way to recover short of closing it.
 *
 * This races the request against a timer and rejects if it wins. The
 * underlying HTTP request itself can't be cancelled (no AbortSignal support
 * in the API), but the caller stops waiting on it and can surface an error.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} — timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}
