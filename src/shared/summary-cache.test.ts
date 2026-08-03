import { describe, it, expect } from "vitest";
import {
  evictSummaryEntries,
  touchSummaryEntry,
  MAX_SUMMARY_ENTRIES,
  SUMMARY_MAX_AGE_MS,
} from "./summary-cache";

interface Entry { summarizedAt: number; v?: string }

function makeMap(entries: [string, Entry][]): Map<string, Entry> {
  return new Map(entries);
}

describe("evictSummaryEntries — age prune", () => {
  const now = 1_000_000_000_000;

  it("drops entries older than the max age", () => {
    const map = makeMap([
      ["fresh", { summarizedAt: now - 1000 }],
      ["stale", { summarizedAt: now - SUMMARY_MAX_AGE_MS - 1 }],
    ]);
    evictSummaryEntries(map, now);
    expect([...map.keys()]).toEqual(["fresh"]);
  });

  it("keeps entries exactly at the age boundary", () => {
    const map = makeMap([["edge", { summarizedAt: now - SUMMARY_MAX_AGE_MS }]]);
    evictSummaryEntries(map, now);
    expect(map.has("edge")).toBe(true);
  });

  it("never age-prunes placeholder entries (summarizedAt === 0)", () => {
    const map = makeMap([["placeholder", { summarizedAt: 0 }]]);
    evictSummaryEntries(map, now);
    expect(map.has("placeholder")).toBe(true);
  });
});

describe("evictSummaryEntries — entry cap", () => {
  it("evicts oldest-inserted keys beyond the cap", () => {
    const now = 1_000_000_000_000;
    const map = makeMap([
      ["a", { summarizedAt: now }],
      ["b", { summarizedAt: now }],
      ["c", { summarizedAt: now }],
    ]);
    evictSummaryEntries(map, now, /*maxEntries*/ 2);
    expect([...map.keys()]).toEqual(["b", "c"]); // "a" (oldest) evicted
  });

  it("is a no-op when at or under the cap", () => {
    const now = 1_000_000_000_000;
    const map = makeMap([["a", { summarizedAt: now }], ["b", { summarizedAt: now }]]);
    evictSummaryEntries(map, now, 2);
    expect([...map.keys()]).toEqual(["a", "b"]);
  });

  it("caps a large cache to MAX_SUMMARY_ENTRIES", () => {
    const now = 1_000_000_000_000;
    const map = new Map<string, Entry>();
    for (let i = 0; i < MAX_SUMMARY_ENTRIES + 50; i++) map.set(`k${i}`, { summarizedAt: now });
    evictSummaryEntries(map, now);
    expect(map.size).toBe(MAX_SUMMARY_ENTRIES);
    expect(map.has("k0")).toBe(false);   // earliest evicted
    expect(map.has("k549")).toBe(true);  // latest kept
  });
});

describe("touchSummaryEntry", () => {
  it("moves a touched key to the most-recently-used position so it survives capping", () => {
    const now = 1_000_000_000_000;
    const map = makeMap([
      ["a", { summarizedAt: now }],
      ["b", { summarizedAt: now }],
      ["c", { summarizedAt: now }],
    ]);
    touchSummaryEntry(map, "a"); // a is now most-recent → order b, c, a
    evictSummaryEntries(map, now, 2);
    expect([...map.keys()]).toEqual(["c", "a"]); // "b" evicted, touched "a" kept
  });

  it("is a no-op for an absent key", () => {
    const map = makeMap([["a", { summarizedAt: 1 }]]);
    touchSummaryEntry(map, "missing");
    expect([...map.keys()]).toEqual(["a"]);
  });
});
