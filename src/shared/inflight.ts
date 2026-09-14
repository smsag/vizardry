/**
 * Per-key request de-duplication, shared by the Linear and Upvoty services.
 *
 * A single note can mention the same ticket a dozen times, and each badge
 * fires its own fetch the moment it is clicked. Without this, ten badges for
 * CORE-1234 mean ten API calls and — worse — ten LLM summarisations of the
 * same issue, each billed. Keyed on the id, the second caller joins the first
 * one's promise instead.
 *
 * Both services previously spelled this out inline, once per method (three
 * near-identical copies of map-lookup / store / `finally`-delete).
 */
export function dedupe<T>(
  inflight: Map<string, Promise<T>>,
  key: string,
  run: () => Promise<T>,
): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return existing;

  const promise = run();
  inflight.set(key, promise);
  // Only clear the slot if it still holds *this* promise: a caller that
  // started a fresh request after this one settled must not have its entry
  // removed by the older request's cleanup.
  //
  // `.then(cleanup, cleanup)` rather than `.finally(cleanup)`: `finally`
  // forwards the rejection into the promise it returns, which nothing here
  // awaits — an unhandled rejection, logged loudly by the runtime, even
  // though the real caller handles its own copy. The two-callback form
  // settles that branch instead of re-throwing.
  const cleanup = (): void => {
    if (inflight.get(key) === promise) inflight.delete(key);
  };
  void promise.then(cleanup, cleanup);
  return promise;
}

/**
 * A one-shot gate for "tell the user their API key is wrong". Every hover
 * over every stale badge hits the same 401, so the notice is shown once per
 * plugin session and reset when the service is re-created (a settings change,
 * a plugin reload) — otherwise fixing the key would never clear the flag.
 */
export function createOnceGate(): { fire(): boolean; reset(): void } {
  let fired = false;
  return {
    /** True the first time only; false on every later call until `reset`. */
    fire(): boolean {
      if (fired) return false;
      fired = true;
      return true;
    },
    reset(): void { fired = false; },
  };
}
