/**
 * Serializes read-modify-write access to the plugin's data.json.
 *
 * `saveSettings()`, `LinearCache.persist()`, and `UpvotyCache.persist()` each
 * do `loadData()` -> merge one key -> `saveData()` independently. Without
 * serialization, two of these racing (e.g. a summary fetch resolving while
 * the user changes a setting) can silently clobber each other: whichever
 * `saveData()` lands last wins, discarding the other's change, since each
 * read its `loadData()` snapshot before the other's write applied.
 *
 * Every caller routes through `updatePersistedData` with the *same* plugin
 * instance, so calls are queued per-plugin and each one's `loadData()` sees
 * the previous call's `saveData()` already applied.
 */

interface DataStore {
  loadData(): Promise<unknown>;
  saveData(data: unknown): Promise<void>;
}

// Keyed by plugin instance (WeakMap so it doesn't hold a reference once the
// plugin itself is garbage-collected, e.g. across test runs).
const queues = new WeakMap<DataStore, Promise<unknown>>();

/**
 * Reads the current persisted data, lets `mutate` update it in place (or
 * return a replacement object), and writes the result back — queued after
 * any other in-flight `updatePersistedData` call for the same plugin.
 */
export function updatePersistedData(
  plugin: DataStore,
  mutate: (existing: Record<string, unknown>) => Record<string, unknown> | void,
): Promise<void> {
  const previous = queues.get(plugin) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(async () => {
    const existing = ((await plugin.loadData()) ?? {}) as Record<string, unknown>;
    const updated = mutate(existing) ?? existing;
    await plugin.saveData(updated);
  });
  queues.set(plugin, next);
  return next;
}
