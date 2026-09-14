/**
 * Keeps the persisted summary caches (Linear + Upvoty) from growing without
 * bound in data.json, and keeps a hand-edited or partially-written data.json
 * from poisoning them.
 *
 * Both caches map an issue/post id to an entry carrying a `summarizedAt`
 * timestamp. Three guards apply, in order:
 *
 *   1. Shape check — an entry that isn't a well-formed object is dropped on
 *      load. This is not defensive padding: an entry with a missing or
 *      non-numeric `summarizedAt` is *immortal*, because both guards below
 *      compare against it and every comparison with NaN/undefined is false —
 *      it never ages out, and its `age >= ttlHours` check never fires either,
 *      so a stale summary is served forever.
 *   2. Age prune — anything older than SUMMARY_MAX_AGE_MS is dropped. The
 *      summary TTL is capped at 168h (7 days) in settings, so an entry this
 *      old is already past any TTL and would be re-fetched on next hover
 *      regardless: dropping it is lossless, it just reclaims disk. Placeholder
 *      entries (summarizedAt === 0, written when a status is known but no
 *      summary generated yet) are exempt from the age prune — they carry no
 *      age — and are bounded by the entry cap alone.
 *   3. Entry cap — beyond MAX_SUMMARY_ENTRIES, the least-recently-used keys are
 *      evicted. Recency is tracked by Map insertion order: `setSummary` and a
 *      cache hit both move a key to the end (see touchSummaryEntry), so the
 *      oldest untouched keys sit at the front and are removed first.
 */

export const MAX_SUMMARY_ENTRIES = 500;
export const SUMMARY_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Evicts least-recently-used keys until `map` is within `maxEntries`.
 * Insertion order is recency order (see touchSummaryEntry), so the front of
 * the Map is the coldest key.
 */
export function evictOldest(map: Map<string, unknown>, maxEntries: number): void {
  while (map.size > maxEntries) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
}

/** Prunes aged-out entries and enforces the hard entry cap, mutating `map`. */
export function evictSummaryEntries<T extends { summarizedAt: number }>(
  map: Map<string, T>,
  now: number = Date.now(),
  maxEntries: number = MAX_SUMMARY_ENTRIES,
  maxAgeMs: number = SUMMARY_MAX_AGE_MS,
): void {
  for (const [key, entry] of map) {
    if (entry.summarizedAt > 0 && now - entry.summarizedAt > maxAgeMs) map.delete(key);
  }
  evictOldest(map as Map<string, unknown>, maxEntries);
}

/**
 * True when `value` is a usable persisted summary entry: an object carrying a
 * string `summary` and a finite, non-negative `summarizedAt`. The per-service
 * fields (`issueUpdatedAt` / `postUpdatedAt`) are checked by the caller's
 * `getUpdatedAt` accessor returning a string — anything else can only make a
 * cached summary read as stale, which is safe, so it isn't gated here.
 */
export function isSummaryEntry(value: unknown): value is { summary: string; summarizedAt: number } {
  if (value === null || typeof value !== "object") return false;
  const entry = value as { summary?: unknown; summarizedAt?: unknown };
  return typeof entry.summary === "string"
    && typeof entry.summarizedAt === "number"
    && Number.isFinite(entry.summarizedAt)
    && entry.summarizedAt >= 0;
}

/**
 * Moves `key` to the most-recently-used position (the end of the Map) so the
 * entry-cap eviction removes genuinely cold keys first. No-op if the key is
 * absent.
 */
export function touchSummaryEntry<T>(map: Map<string, T>, key: string): void {
  const entry = map.get(key);
  if (entry !== undefined) {
    map.delete(key);
    map.set(key, entry);
  }
}
