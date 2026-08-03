/**
 * Keeps the persisted summary caches (Linear + Upvoty) from growing without
 * bound in data.json.
 *
 * Both caches map an issue/post id to an entry carrying a `summarizedAt`
 * timestamp. Two guards apply, in order:
 *
 *   1. Age prune — anything older than SUMMARY_MAX_AGE_MS is dropped. The
 *      summary TTL is capped at 168h (7 days) in settings, so an entry this
 *      old is already past any TTL and would be re-fetched on next hover
 *      regardless: dropping it is lossless, it just reclaims disk. Placeholder
 *      entries (summarizedAt === 0, written when a status is known but no
 *      summary generated yet) are exempt from the age prune — they carry no
 *      age — and are bounded by the entry cap alone.
 *   2. Entry cap — beyond MAX_SUMMARY_ENTRIES, the least-recently-used keys are
 *      evicted. Recency is tracked by Map insertion order: `setSummary` and a
 *      cache hit both move a key to the end (see touchSummaryEntry), so the
 *      oldest untouched keys sit at the front and are removed first.
 */

export const MAX_SUMMARY_ENTRIES = 500;
export const SUMMARY_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

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
  while (map.size > maxEntries) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
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
