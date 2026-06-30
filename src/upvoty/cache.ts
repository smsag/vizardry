import type { Plugin } from "obsidian";
import type { UpvotyPost, UpvotyCacheEntry } from "./types";

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
    return age < ttlHours ? entry.summary : null;
  }

  async setSummary(postId: string, entry: UpvotyCacheEntry): Promise<void> {
    this.summaryCache.set(postId, entry);
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

  private async persist(): Promise<void> {
    const existing = ((await this.plugin.loadData()) ?? {}) as Record<string, unknown>;
    existing.upvotyCache = this.toJSON();
    await this.plugin.saveData(existing);
  }
}
