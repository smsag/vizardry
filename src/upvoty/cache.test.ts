import { describe, it, expect, vi } from "vitest";
import { UpvotyCache } from "./cache";
import type { UpvotyCacheEntry } from "./types";

function fakePlugin() {
  return {
    loadData: vi.fn().mockResolvedValue({}),
    saveData: vi.fn().mockResolvedValue(undefined),
  };
}

describe("UpvotyCache", () => {
  it("init() populates the summary cache so getSummary/getEntry see restored entries", () => {
    const cache = new UpvotyCache(fakePlugin() as any);
    const entry: UpvotyCacheEntry = { summary: "Restored summary", postUpdatedAt: "2026-01-01T00:00:00Z", summarizedAt: Date.now() };

    cache.init({ "post-1": entry });

    expect(cache.getEntry("post-1")).toEqual(entry);
    expect(cache.getSummary("post-1", 24, "2026-01-01T00:00:00Z")).toBe("Restored summary");
  });

  it("init() with no matching entries leaves the cache empty", () => {
    const cache = new UpvotyCache(fakePlugin() as any);
    cache.init({});
    expect(cache.getEntry("post-1")).toBeUndefined();
  });

  it("a restored entry is treated as stale once postUpdatedAt no longer matches", () => {
    const cache = new UpvotyCache(fakePlugin() as any);
    cache.init({ "post-1": { summary: "Old", postUpdatedAt: "2026-01-01T00:00:00Z", summarizedAt: Date.now() } });

    expect(cache.getSummary("post-1", 24, "2026-02-01T00:00:00Z")).toBeNull();
  });

  it("toJSON() round-trips through init()", () => {
    const source = new UpvotyCache(fakePlugin() as any);
    source.init({ "post-1": { summary: "X", postUpdatedAt: "2026-01-01T00:00:00Z", summarizedAt: Date.now() } });

    const restored = new UpvotyCache(fakePlugin() as any);
    restored.init(source.toJSON());

    expect(restored.toJSON()).toEqual(source.toJSON());
  });

  it("clear() drops in-memory entries without touching persisted data.json", async () => {
    const plugin = fakePlugin();
    const cache = new UpvotyCache(plugin as any);
    cache.init({ "post-1": { summary: "X", postUpdatedAt: "2026-01-01T00:00:00Z", summarizedAt: Date.now() } });

    cache.clear();

    expect(cache.getEntry("post-1")).toBeUndefined();
    expect(plugin.saveData).not.toHaveBeenCalled();
  });

  it("init() prunes an aged-out entry and persists the trimmed cache", async () => {
    const plugin = fakePlugin();
    const cache = new UpvotyCache(plugin as any);
    const ancient = { summary: "old", postUpdatedAt: "2020-01-01T00:00:00Z", summarizedAt: 1 };
    const fresh = { summary: "new", postUpdatedAt: "2026-01-01T00:00:00Z", summarizedAt: Date.now() };

    cache.init({ "old-1": ancient, "new-1": fresh });

    expect(cache.getEntry("old-1")).toBeUndefined();
    expect(cache.getEntry("new-1")).toEqual(fresh);
    // Persist is fire-and-forget through the async queue — flush it first.
    await new Promise((r) => setTimeout(r));
    expect(plugin.saveData).toHaveBeenCalledWith(
      expect.objectContaining({ upvotyCache: { "new-1": fresh } }),
    );
  });

  it("clearAndPersist() drops in-memory entries and persists the now-empty cache", async () => {
    const plugin = fakePlugin();
    const cache = new UpvotyCache(plugin as any);
    cache.init({ "post-1": { summary: "X", postUpdatedAt: "2026-01-01T00:00:00Z", summarizedAt: Date.now() } });
    cache.setStatus("post-1", { id: "post-1" } as any);

    await cache.clearAndPersist();

    expect(cache.getEntry("post-1")).toBeUndefined();
    expect(cache.getStatus("post-1", 60)).toBeNull();
    expect(plugin.saveData).toHaveBeenCalledWith(expect.objectContaining({ upvotyCache: {} }));
  });
});
