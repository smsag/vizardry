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
    source.init({ "post-1": { summary: "X", postUpdatedAt: "2026-01-01T00:00:00Z", summarizedAt: 123 } });

    const restored = new UpvotyCache(fakePlugin() as any);
    restored.init(source.toJSON());

    expect(restored.toJSON()).toEqual(source.toJSON());
  });
});
