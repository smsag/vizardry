import type { Plugin } from "obsidian";
import { updatePersistedData } from "./persisted-data";
import { evictOldest, evictSummaryEntries, isSummaryEntry, touchSummaryEntry } from "./summary-cache";

const MAX_STATUS_ENTRIES = 200;

/** How long writes are coalesced before one persist runs. See `schedulePersist`. */
export const PERSIST_COALESCE_MS = 250;

interface StatusEntry<T> {
  item: T;
  fetchedAt: number;
}

/**
 * The read-through cache shared by the Linear and Upvoty integrations.
 *
 * Two layers, deliberately different:
 *
 *   • **status** — the freshly fetched item itself (a Linear issue, an Upvoty
 *     post), in memory only, valid for `statusTtlMinutes`. This is what stops
 *     every popover open from costing a network round-trip. It is not
 *     persisted: the point of a short TTL is to notice remote changes soon
 *     after a restart.
 *   • **summary** — the LLM-generated one-liner, persisted to data.json under
 *     `persistKey`, valid for `summaryTtlHours` *and* only while the item's
 *     own `updatedAt` still matches the one it was generated from. Summaries
 *     cost money and latency, so they outlive a restart.
 */
export class IntegrationCache<StatusT, SummaryEntryT extends { summary: string; summarizedAt: number }> {
  private statusCache = new Map<string, StatusEntry<StatusT>>();
  private summaryCache = new Map<string, SummaryEntryT>();
  private plugin: Plugin;
  private persistKey: string;
  private getUpdatedAt: (entry: SummaryEntryT) => string;
  private pendingPersist: Promise<void> | null = null;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(plugin: Plugin, persistKey: string, getUpdatedAt: (entry: SummaryEntryT) => string) {
    this.plugin = plugin;
    this.persistKey = persistKey;
    this.getUpdatedAt = getUpdatedAt;
  }

  /**
   * Restores the persisted summaries. `persisted` comes straight out of
   * data.json, so it is treated as untrusted: a non-object blob is ignored
   * wholesale and individual entries that don't match the expected shape are
   * dropped (see `isSummaryEntry` for why a malformed entry would otherwise
   * be immortal). Replaces any existing contents rather than merging, so a
   * re-init can't leave entries from a previous load behind.
   *
   * Rewrites data.json only when something was actually dropped.
   */
  init(persisted: unknown): void {
    this.summaryCache.clear();
    let dropped = 0;
    if (persisted !== null && typeof persisted === "object" && !Array.isArray(persisted)) {
      for (const [key, entry] of Object.entries(persisted as Record<string, unknown>)) {
        if (isSummaryEntry(entry)) this.summaryCache.set(key, entry as SummaryEntryT);
        else dropped++;
      }
    } else if (persisted !== undefined && persisted !== null) {
      console.warn(`Vizardry: ignoring malformed "${this.persistKey}" in data.json`);
      dropped++;
    }
    const before = this.summaryCache.size;
    evictSummaryEntries(this.summaryCache);
    // Background write — see `cacheSummary` on why the rejection is absorbed.
    if (dropped > 0 || this.summaryCache.size !== before) void this.schedulePersist().catch(() => {});
  }

  getStatus(key: string, ttlMinutes: number): StatusT | null {
    const entry = this.statusCache.get(key);
    if (!entry) return null;
    const age = (Date.now() - entry.fetchedAt) / 60_000;
    if (age >= ttlMinutes) {
      this.statusCache.delete(key); // expired — don't let it hold an LRU slot
      return null;
    }
    // Re-insert so the cap below evicts genuinely cold keys first.
    touchSummaryEntry(this.statusCache, key);
    return entry.item;
  }

  setStatus(key: string, item: StatusT): void {
    this.statusCache.delete(key);
    this.statusCache.set(key, { item, fetchedAt: Date.now() });
    evictOldest(this.statusCache as Map<string, unknown>, MAX_STATUS_ENTRIES);
  }

  getSummary(key: string, ttlHours: number, currentUpdatedAt: string): string | null {
    const entry = this.summaryCache.get(key);
    if (!entry) return null;
    if (this.getUpdatedAt(entry) !== currentUpdatedAt) return null;
    const age = (Date.now() - entry.summarizedAt) / 3_600_000;
    if (age >= ttlHours) return null;
    touchSummaryEntry(this.summaryCache, key);
    return entry.summary;
  }

  setSummary(key: string, entry: SummaryEntryT): Promise<void> {
    this.summaryCache.delete(key);
    this.summaryCache.set(key, entry);
    evictSummaryEntries(this.summaryCache);
    return this.schedulePersist();
  }

  /**
   * `setSummary` for callers that must not wait on the disk — the entry is in
   * memory the moment this returns, and a popover should never sit on a
   * loading state for a data.json write.
   *
   * Swallowing here is not losing the error: `updatePersistedData` already
   * logs a failed write. What it avoids is an unhandled rejection from a
   * promise nobody is left holding.
   */
  cacheSummary(key: string, entry: SummaryEntryT): void {
    void this.setSummary(key, entry).catch(() => {});
  }

  getEntry(key: string): SummaryEntryT | undefined {
    return this.summaryCache.get(key);
  }

  toJSON(): Record<string, SummaryEntryT> {
    return Object.fromEntries(this.summaryCache.entries());
  }

  clear(): void {
    this.statusCache.clear();
    this.summaryCache.clear();
  }

  async clearAndPersist(): Promise<void> {
    this.clear();
    await this.flush();
  }

  /**
   * Coalesces cache writes into one data.json round-trip.
   *
   * Every persist serialises the *whole* summary map (up to 500 entries) and
   * runs a read-modify-write over the entire data.json — so a burst of writes
   * (opening a canvas full of ticket keys resolves many summaries at once)
   * used to mean one full rewrite each. They all produce the same final
   * state, so a short window collapses them into a single write.
   *
   * The returned promise resolves once the write covering this call has
   * landed, so callers that await it still get a real durability guarantee.
   */
  private schedulePersist(): Promise<void> {
    if (this.pendingPersist) return this.pendingPersist;
    this.pendingPersist = new Promise<void>((resolve, reject) => {
      this.persistTimer = setTimeout(() => {
        this.persistTimer = null;
        this.pendingPersist = null;
        this.persistNow().then(resolve, reject);
      }, PERSIST_COALESCE_MS);
    });
    return this.pendingPersist;
  }

  /** Writes any coalesced changes out immediately. */
  async flush(): Promise<void> {
    if (this.persistTimer !== null) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
      this.pendingPersist = null;
    }
    await this.persistNow();
  }

  private persistNow(): Promise<void> {
    return updatePersistedData(this.plugin, (existing) => {
      existing[this.persistKey] = this.toJSON();
    });
  }
}
