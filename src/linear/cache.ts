import type { Plugin } from "obsidian";
import type { CacheEntry, LinearState } from "./types";
import { updatePersistedData } from "../shared/persisted-data";
import { evictSummaryEntries, touchSummaryEntry } from "../shared/summary-cache";

const MAX_STATUS_ENTRIES = 200;

interface StatusEntry {
  state: LinearState;
  fetchedAt: number;
}

/**
 * Two-tier cache for Linear data:
 * - Status (state name + color): in-memory only, short TTL
 * - Summaries: in-memory + persisted in data.json, long TTL
 *
 * Summary cache is invalidated when `issueUpdatedAt` changes on Linear.
 */
export class LinearCache {
  private statusCache = new Map<string, StatusEntry>();
  private summaryCache = new Map<string, CacheEntry>();
  private plugin: Plugin;

  constructor(plugin: Plugin) {
    this.plugin = plugin;
  }

  /** Populate in-memory summary cache from data already loaded by the plugin.
   *  Aged-out / over-cap entries are pruned on load and the trimmed result is
   *  written back so data.json actually shrinks (not just the in-memory copy). */
  init(persisted: Record<string, CacheEntry>): void {
    for (const [key, entry] of Object.entries(persisted)) {
      this.summaryCache.set(key, entry);
    }
    const before = this.summaryCache.size;
    evictSummaryEntries(this.summaryCache);
    if (this.summaryCache.size !== before) void this.persist();
  }

  // ── Status ──────────────────────────────────────────────────────────────────

  getStatus(issueKey: string, ttlMinutes: number): LinearState | null {
    const entry = this.statusCache.get(issueKey);
    if (!entry) return null;
    const age = (Date.now() - entry.fetchedAt) / 60_000;
    return age < ttlMinutes ? entry.state : null;
  }

  setStatus(issueKey: string, state: LinearState): void {
    this.statusCache.delete(issueKey);
    this.statusCache.set(issueKey, { state, fetchedAt: Date.now() });
    while (this.statusCache.size > MAX_STATUS_ENTRIES) {
      const oldest = this.statusCache.keys().next().value;
      if (oldest === undefined) break;
      this.statusCache.delete(oldest);
    }
  }

  // ── Summaries ────────────────────────────────────────────────────────────────

  /**
   * Returns a cached summary if it exists, hasn't expired, and the issue
   * hasn't been updated on Linear since it was cached.
   */
  getSummary(issueKey: string, ttlHours: number, currentUpdatedAt: string): string | null {
    const entry = this.summaryCache.get(issueKey);
    if (!entry) return null;
    if (entry.issueUpdatedAt !== currentUpdatedAt) return null; // issue changed
    const age = (Date.now() - entry.summarizedAt) / 3_600_000;
    if (age >= ttlHours) return null;
    touchSummaryEntry(this.summaryCache, issueKey); // mark most-recently-used
    return entry.summary;
  }

  async setSummary(issueKey: string, entry: CacheEntry): Promise<void> {
    // delete-then-set moves an updated key to the most-recently-used position.
    this.summaryCache.delete(issueKey);
    this.summaryCache.set(issueKey, entry);
    evictSummaryEntries(this.summaryCache);
    await this.persist();
  }

  /** Returns a cached CacheEntry (for reusing state + summary together). */
  getEntry(issueKey: string): CacheEntry | undefined {
    return this.summaryCache.get(issueKey);
  }

  /** Serialize the summary cache into the shape stored in data.json. */
  toJSON(): Record<string, CacheEntry> {
    return Object.fromEntries(this.summaryCache.entries());
  }

  clear(): void {
    this.statusCache.clear();
    this.summaryCache.clear();
  }

  /**
   * Clears the cache and persists the (now empty) summary cache to
   * data.json. Use this — not plain clear() — when the user repoints the
   * integration at different credentials/workspace, so stale entries don't
   * reappear on the next plugin load via init(). Plain clear() alone is for
   * in-memory-only cleanup (e.g. service teardown on unload), where wiping
   * the persisted cache would force every summary to be re-fetched next
   * session for no reason.
   */
  async clearAndPersist(): Promise<void> {
    this.clear();
    await this.persist();
  }

  private async persist(): Promise<void> {
    await updatePersistedData(this.plugin, (existing) => {
      existing.linearCache = this.toJSON();
    });
  }
}
