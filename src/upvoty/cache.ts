import type { Plugin } from "obsidian";
import type { UpvotyPost, UpvotyCacheEntry } from "./types";
import { updatePersistedData } from "../shared/persisted-data";
import { evictSummaryEntries, touchSummaryEntry } from "../shared/summary-cache";

interface StatusEntry {
  post: UpvotyPost;
  fetchedAt: number;
}

/**
 * Two-tier cache for Upvoty data, mirroring LinearCache:
 * - Status / post metadata: in-memory only, short TTL
 * - Summaries: in-memory + persisted in data.json, long TTL
 *
 * Summary cache is invalidated when `updated_at` changes on Upvoty.
 */
export class UpvotyCache {
  private statusCache = new Map<string, StatusEntry>();
  private summaryCache = new Map<string, UpvotyCacheEntry>();
  private plugin: Plugin;

  constructor(plugin: Plugin) {
    this.plugin = plugin;
  }

  /** Populate in-memory summary cache from data already loaded by the plugin.
   *  Aged-out / over-cap entries are pruned on load and the trimmed result is
   *  written back so data.json actually shrinks (not just the in-memory copy). */
  init(persisted: Record<string, UpvotyCacheEntry>): void {
    for (const [key, entry] of Object.entries(persisted)) {
      this.summaryCache.set(key, entry);
    }
    const before = this.summaryCache.size;
    evictSummaryEntries(this.summaryCache);
    if (this.summaryCache.size !== before) void this.persist();
  }

  // ── Status ───────────────────────────────────────────────────────────────────

  getPost(postId: string, ttlMinutes: number): UpvotyPost | null {
    const entry = this.statusCache.get(postId);
    if (!entry) return null;
    const age = (Date.now() - entry.fetchedAt) / 60_000;
    return age < ttlMinutes ? entry.post : null;
  }

  setPost(postId: string, post: UpvotyPost): void {
    this.statusCache.set(postId, { post, fetchedAt: Date.now() });
  }

  // ── Summaries ────────────────────────────────────────────────────────────────

  getSummary(postId: string, ttlHours: number, currentUpdatedAt: string): string | null {
    const entry = this.summaryCache.get(postId);
    if (!entry) return null;
    if (entry.postUpdatedAt !== currentUpdatedAt) return null;
    const age = (Date.now() - entry.summarizedAt) / 3_600_000;
    if (age >= ttlHours) return null;
    touchSummaryEntry(this.summaryCache, postId); // mark most-recently-used
    return entry.summary;
  }

  async setSummary(postId: string, entry: UpvotyCacheEntry): Promise<void> {
    // delete-then-set moves an updated key to the most-recently-used position.
    this.summaryCache.delete(postId);
    this.summaryCache.set(postId, entry);
    evictSummaryEntries(this.summaryCache);
    await this.persist();
  }

  getEntry(postId: string): UpvotyCacheEntry | undefined {
    return this.summaryCache.get(postId);
  }

  toJSON(): Record<string, UpvotyCacheEntry> {
    return Object.fromEntries(this.summaryCache.entries());
  }

  clear(): void {
    this.statusCache.clear();
    this.summaryCache.clear();
  }

  /**
   * Clears the cache and persists the (now empty) summary cache to
   * data.json. Use this — not plain clear() — when the user repoints the
   * integration at different credentials/board, so stale entries don't
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
      existing.upvotyCache = this.toJSON();
    });
  }
}
