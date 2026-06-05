import type { Plugin } from "obsidian";
import type { CacheEntry, LinearState } from "./types";

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

  /** Populate in-memory summary cache from data already loaded by the plugin. */
  init(persisted: Record<string, CacheEntry>): void {
    for (const [key, entry] of Object.entries(persisted)) {
      this.summaryCache.set(key, entry);
    }
  }

  // ── Status ──────────────────────────────────────────────────────────────────

  getStatus(issueKey: string, ttlMinutes: number): LinearState | null {
    const entry = this.statusCache.get(issueKey);
    if (!entry) return null;
    const age = (Date.now() - entry.fetchedAt) / 60_000;
    return age < ttlMinutes ? entry.state : null;
  }

  setStatus(issueKey: string, state: LinearState): void {
    this.statusCache.set(issueKey, { state, fetchedAt: Date.now() });
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
    return age < ttlHours ? entry.summary : null;
  }

  async setSummary(issueKey: string, entry: CacheEntry): Promise<void> {
    this.summaryCache.set(issueKey, entry);
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

  private async persist(): Promise<void> {
    const existing = ((await this.plugin.loadData()) ?? {}) as Record<string, unknown>;
    existing.linearCache = this.toJSON();
    await this.plugin.saveData(existing);
  }
}
