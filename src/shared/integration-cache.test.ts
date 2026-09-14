import { describe, it, expect, vi } from "vitest";
import { IntegrationCache } from "./integration-cache";

interface Entry { summary: string; summarizedAt: number; updatedAt: string }

function makeCache(initial: Record<string, unknown> = {}) {
  let data: Record<string, unknown> = { ...initial };
  const plugin = {
    loadData: vi.fn(async () => ({ ...data })),
    saveData: vi.fn(async (next: Record<string, unknown>) => { data = { ...next }; }),
  };
  const cache = new IntegrationCache<{ id: string }, Entry>(
    plugin as never,
    "testCache",
    (entry) => entry.updatedAt,
  );
  return { cache, plugin, persisted: () => data.testCache as Record<string, Entry> | undefined };
}

const entry = (over: Partial<Entry> = {}): Entry =>
  ({ summary: "s", summarizedAt: Date.now(), updatedAt: "2026-01-01T00:00:00Z", ...over });

describe("IntegrationCache.init", () => {
  it("restores well-formed entries", () => {
    const { cache } = makeCache();
    const good = entry();
    cache.init({ "a": good });
    expect(cache.getEntry("a")).toEqual(good);
  });

  it("ignores a blob that isn't an object", async () => {
    // data.json is user-editable; Object.entries("oops") would otherwise yield
    // one bogus entry per character.
    for (const bad of ["oops", 42, [1, 2], true]) {
      const { cache } = makeCache();
      cache.init(bad);
      expect(cache.toJSON()).toEqual({});
    }
  });

  it("treats a missing blob as an empty cache without rewriting data.json", async () => {
    const { cache, plugin } = makeCache();
    cache.init(undefined);
    await cache.flush().catch(() => {});
    expect(cache.toJSON()).toEqual({});
    // flush() was explicit here; nothing was scheduled by init itself.
    expect(plugin.saveData).toHaveBeenCalledTimes(1);
  });

  it("drops an entry with a non-numeric summarizedAt", async () => {
    // Such an entry is immortal: NaN/undefined loses every comparison, so it
    // never ages out and its TTL check never fires — a stale summary forever.
    const { cache } = makeCache();
    cache.init({
      good: entry(),
      noTimestamp: { summary: "x", updatedAt: "2026-01-01T00:00:00Z" },
      nanTimestamp: { summary: "x", summarizedAt: NaN, updatedAt: "2026-01-01T00:00:00Z" },
      stringTimestamp: { summary: "x", summarizedAt: "123", updatedAt: "2026-01-01T00:00:00Z" },
      noSummary: { summarizedAt: 1 },
      notAnObject: "nope",
      isNull: null,
    });
    expect(Object.keys(cache.toJSON())).toEqual(["good"]);
  });

  it("persists the cleaned cache when it dropped something", async () => {
    const { cache, plugin, persisted } = makeCache();
    cache.init({ good: entry(), broken: { summary: "x" } });
    await cache.flush();
    expect(plugin.saveData).toHaveBeenCalled();
    expect(Object.keys(persisted() ?? {})).toEqual(["good"]);
  });

  it("replaces rather than merges, so a re-init leaves nothing behind", () => {
    const { cache } = makeCache();
    cache.init({ a: entry() });
    cache.init({ b: entry() });
    expect(Object.keys(cache.toJSON())).toEqual(["b"]);
  });
});

describe("IntegrationCache status layer", () => {
  it("serves an item inside the TTL and drops it once expired", () => {
    const { cache } = makeCache();
    const now = vi.spyOn(Date, "now");

    now.mockReturnValue(0);
    cache.setStatus("a", { id: "a" });
    now.mockReturnValue(4 * 60_000);
    expect(cache.getStatus("a", 5)).toEqual({ id: "a" });

    now.mockReturnValue(6 * 60_000);
    expect(cache.getStatus("a", 5)).toBeNull();
    // The expired entry is evicted, not left holding an LRU slot.
    now.mockReturnValue(6 * 60_000);
    expect(cache.getStatus("a", 1000)).toBeNull();

    now.mockRestore();
  });
});

describe("IntegrationCache summary layer", () => {
  it("misses when the item's own updatedAt has moved on", () => {
    const { cache } = makeCache();
    cache.init({ a: entry({ updatedAt: "2026-01-01T00:00:00Z" }) });
    expect(cache.getSummary("a", 24, "2026-01-01T00:00:00Z")).toBe("s");
    expect(cache.getSummary("a", 24, "2026-06-01T00:00:00Z")).toBeNull();
  });

  it("misses once the entry is older than the TTL", () => {
    const { cache } = makeCache();
    cache.init({ a: entry({ summarizedAt: Date.now() - 5 * 3_600_000 }) });
    expect(cache.getSummary("a", 24, "2026-01-01T00:00:00Z")).toBe("s");
    expect(cache.getSummary("a", 1, "2026-01-01T00:00:00Z")).toBeNull();
  });
});

describe("IntegrationCache persistence", () => {
  it("coalesces a burst of writes into a single data.json round-trip", async () => {
    // Opening a canvas full of ticket keys resolves many summaries at once;
    // each persist serialises the whole map and rewrites all of data.json.
    const { cache, plugin, persisted } = makeCache();

    const writes = ["a", "b", "c", "d"].map(key => cache.setSummary(key, entry({ summary: key })));
    await Promise.all(writes);

    expect(plugin.saveData).toHaveBeenCalledTimes(1);
    expect(Object.keys(persisted() ?? {})).toEqual(["a", "b", "c", "d"]);
  });

  it("still resolves the caller's promise only once the write has landed", async () => {
    const { cache, plugin, persisted } = makeCache();
    await cache.setSummary("a", entry());
    expect(plugin.saveData).toHaveBeenCalled();
    expect(persisted()).toHaveProperty("a");
  });

  it("leaves other keys in data.json untouched", async () => {
    const { cache, plugin } = makeCache({ sketchMode: true, otherCache: { x: 1 } });
    await cache.setSummary("a", entry());
    expect(plugin.saveData).toHaveBeenCalledWith(
      expect.objectContaining({ sketchMode: true, otherCache: { x: 1 } }),
    );
  });

  it("flush() writes out a pending coalesced change immediately", async () => {
    const { cache, persisted } = makeCache();
    void cache.setSummary("a", entry());
    await cache.flush();
    expect(persisted()).toHaveProperty("a");
  });
});

describe("IntegrationCache background writes", () => {
  it("does not surface a failed background write as an unhandled rejection", async () => {
    // `updatePersistedData` already logs the failure; what must not happen is
    // a rejected promise with nobody left holding it.
    const plugin = {
      loadData: vi.fn(async () => ({})),
      saveData: vi.fn(async () => { throw new Error("disk full"); }),
    };
    const cache = new IntegrationCache<{ id: string }, Entry>(
      plugin as never, "testCache", (e) => e.updatedAt,
    );
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);

    cache.cacheSummary("a", entry());
    await new Promise((r) => setTimeout(r, 400));
    await new Promise((r) => setTimeout(r, 0));

    process.off("unhandledRejection", unhandled);
    expect(unhandled).not.toHaveBeenCalled();
    // The entry is in memory regardless of whether the write landed.
    expect(cache.getEntry("a")).toBeDefined();
  });
});
