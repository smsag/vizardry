import { describe, it, expect, vi } from "vitest";
import { LinearCache } from "./cache";
import type { CacheEntry, LinearState } from "./types";

function fakePlugin() {
  return {
    loadData: vi.fn().mockResolvedValue({}),
    saveData: vi.fn().mockResolvedValue(undefined),
  };
}

const STATE: LinearState = { name: "In Progress", color: "#4ea7fc", type: "started" };

describe("LinearCache", () => {
  it("init() populates the summary cache so getSummary/getEntry see restored entries", () => {
    const cache = new LinearCache(fakePlugin() as any);
    const entry: CacheEntry = { state: STATE, summary: "Restored summary", issueUpdatedAt: "2026-01-01T00:00:00Z", summarizedAt: Date.now() };

    cache.init({ "ENG-1": entry });

    expect(cache.getEntry("ENG-1")).toEqual(entry);
    expect(cache.getSummary("ENG-1", 24, "2026-01-01T00:00:00Z")).toBe("Restored summary");
  });

  it("init() with no matching entries leaves the cache empty", () => {
    const cache = new LinearCache(fakePlugin() as any);
    cache.init({});
    expect(cache.getEntry("ENG-1")).toBeUndefined();
  });

  it("a restored entry is treated as stale once issueUpdatedAt no longer matches", () => {
    const cache = new LinearCache(fakePlugin() as any);
    cache.init({ "ENG-1": { state: STATE, summary: "Old", issueUpdatedAt: "2026-01-01T00:00:00Z", summarizedAt: Date.now() } });

    expect(cache.getSummary("ENG-1", 24, "2026-02-01T00:00:00Z")).toBeNull();
  });

  it("toJSON() round-trips through init()", () => {
    const source = new LinearCache(fakePlugin() as any);
    source.init({ "ENG-1": { state: STATE, summary: "X", issueUpdatedAt: "2026-01-01T00:00:00Z", summarizedAt: 123 } });

    const restored = new LinearCache(fakePlugin() as any);
    restored.init(source.toJSON());

    expect(restored.toJSON()).toEqual(source.toJSON());
  });

  it("clear() drops in-memory entries without touching persisted data.json", () => {
    const plugin = fakePlugin();
    const cache = new LinearCache(plugin as any);
    cache.init({ "ENG-1": { state: STATE, summary: "X", issueUpdatedAt: "2026-01-01T00:00:00Z", summarizedAt: 123 } });

    cache.clear();

    expect(cache.getEntry("ENG-1")).toBeUndefined();
    expect(plugin.saveData).not.toHaveBeenCalled();
  });

  it("clearAndPersist() drops in-memory entries and persists the now-empty cache", async () => {
    const plugin = fakePlugin();
    const cache = new LinearCache(plugin as any);
    cache.init({ "ENG-1": { state: STATE, summary: "X", issueUpdatedAt: "2026-01-01T00:00:00Z", summarizedAt: 123 } });
    cache.setStatus("ENG-1", STATE);

    await cache.clearAndPersist();

    expect(cache.getEntry("ENG-1")).toBeUndefined();
    expect(cache.getStatus("ENG-1", 60)).toBeNull();
    expect(plugin.saveData).toHaveBeenCalledWith(expect.objectContaining({ linearCache: {} }));
  });

  it("prevents a stale cross-workspace summary from surviving a settings switch", async () => {
    // Same issue key ("ENG-1") can exist in two different Linear workspaces.
    // clearAndPersist() must guarantee the old workspace's cached summary is
    // gone, not just expired-and-ignorable.
    const plugin = fakePlugin();
    const cache = new LinearCache(plugin as any);
    cache.init({ "ENG-1": { state: STATE, summary: "Workspace A's issue", issueUpdatedAt: "2026-01-01T00:00:00Z", summarizedAt: Date.now() } });
    expect(cache.getSummary("ENG-1", 999, "2026-01-01T00:00:00Z")).toBe("Workspace A's issue");

    await cache.clearAndPersist();

    // Workspace B's "ENG-1" happens to share the same updatedAt timestamp —
    // without clearing, this would still incorrectly hit as a cache match.
    expect(cache.getSummary("ENG-1", 999, "2026-01-01T00:00:00Z")).toBeNull();
  });
});
