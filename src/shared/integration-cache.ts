import type { Plugin } from "obsidian";
import { updatePersistedData } from "./persisted-data";
import { evictSummaryEntries, touchSummaryEntry } from "./summary-cache";

const MAX_STATUS_ENTRIES = 200;

interface StatusEntry<T> {
  item: T;
  fetchedAt: number;
}

export class IntegrationCache<StatusT, SummaryEntryT extends { summary: string; summarizedAt: number }> {
  private statusCache = new Map<string, StatusEntry<StatusT>>();
  private summaryCache = new Map<string, SummaryEntryT>();
  private plugin: Plugin;
  private persistKey: string;
  private getUpdatedAt: (entry: SummaryEntryT) => string;

  constructor(plugin: Plugin, persistKey: string, getUpdatedAt: (entry: SummaryEntryT) => string) {
    this.plugin = plugin;
    this.persistKey = persistKey;
    this.getUpdatedAt = getUpdatedAt;
  }

  init(persisted: Record<string, SummaryEntryT>): void {
    for (const [key, entry] of Object.entries(persisted)) {
      this.summaryCache.set(key, entry);
    }
    const before = this.summaryCache.size;
    evictSummaryEntries(this.summaryCache);
    if (this.summaryCache.size !== before) void this.persist();
  }

  getStatus(key: string, ttlMinutes: number): StatusT | null {
    const entry = this.statusCache.get(key);
    if (!entry) return null;
    const age = (Date.now() - entry.fetchedAt) / 60_000;
    return age < ttlMinutes ? entry.item : null;
  }

  setStatus(key: string, item: StatusT): void {
    this.statusCache.delete(key);
    this.statusCache.set(key, { item, fetchedAt: Date.now() });
    while (this.statusCache.size > MAX_STATUS_ENTRIES) {
      const oldest = this.statusCache.keys().next().value;
      if (oldest === undefined) break;
      this.statusCache.delete(oldest);
    }
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

  async setSummary(key: string, entry: SummaryEntryT): Promise<void> {
    this.summaryCache.delete(key);
    this.summaryCache.set(key, entry);
    evictSummaryEntries(this.summaryCache);
    await this.persist();
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
    await this.persist();
  }

  private async persist(): Promise<void> {
    await updatePersistedData(this.plugin, (existing) => {
      existing[this.persistKey] = this.toJSON();
    });
  }
}
