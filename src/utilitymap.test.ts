import { describe, expect, it } from "vitest";
import { parseBuyerUtilityMap, DEFAULT_STAGES, DEFAULT_LEVERS } from "./utilitymap";

function ok(src: string) {
  const r = parseBuyerUtilityMap(src);
  if (!r.ok) throw new Error("expected ok");
  return r.data;
}

describe("parseBuyerUtilityMap", () => {
  it("defaults to the canonical 6 stages and 6 levers", () => {
    const d = ok("");
    expect(d.stages).toEqual(DEFAULT_STAGES);
    expect(d.levers).toEqual(DEFAULT_LEVERS);
    expect(d.cells).toEqual([]);
  });

  it("resolves utility/pain cells to stage/lever indices with notes", () => {
    const d = ok([
      "utility: Purchase | Convenience | Buy in-app",
      "pain: Disposal | Environmental | Waste piles up",
    ].join("\n"));
    expect(d.cells).toEqual([
      { stageIndex: 0, leverIndex: 2, kind: "utility", note: "Buy in-app" },
      { stageIndex: 5, leverIndex: 5, kind: "pain", note: "Waste piles up" },
    ]);
  });

  it("accepts a note-less cell", () => {
    const d = ok("utility: Use | Simplicity");
    expect(d.cells[0]).toEqual({ stageIndex: 2, leverIndex: 1, kind: "utility", note: undefined });
  });

  it("resolves short prefix aliases for levers", () => {
    const d = ok([
      "utility: Use | Productivity",   // → Customer Productivity
      "utility: Use | Fun",            // → Fun & Image
    ].join("\n"));
    expect(d.cells[0].leverIndex).toBe(0);
    expect(d.cells[1].leverIndex).toBe(4);
  });

  it("warns and skips an unknown stage or lever", () => {
    const d = ok([
      "utility: Nowhere | Simplicity",
      "utility: Use | Nonsense",
    ].join("\n"));
    expect(d.cells).toHaveLength(0);
    expect(d.warnings?.some(w => w.includes("unknown stage"))).toBe(true);
    expect(d.warnings?.some(w => w.includes("unknown lever"))).toBe(true);
  });

  it("skips a duplicate cell with a warning", () => {
    const d = ok([
      "utility: Use | Simplicity | first",
      "pain: Use | Simplicity | second",
    ].join("\n"));
    expect(d.cells).toHaveLength(1);
    expect(d.cells[0].note).toBe("first");
    expect(d.warnings?.some(w => w.includes("already marked"))).toBe(true);
  });

  it("honours stages: and levers: overrides", () => {
    const d = ok([
      "stages: Buy | Own | Toss",
      "levers: Speed | Cost",
      "utility: Own | Cost | cheaper to keep",
    ].join("\n"));
    expect(d.stages).toEqual(["Buy", "Own", "Toss"]);
    expect(d.levers).toEqual(["Speed", "Cost"]);
    expect(d.cells[0]).toEqual({ stageIndex: 1, leverIndex: 1, kind: "utility", note: "cheaper to keep" });
  });

  it("is never fatal", () => {
    expect(parseBuyerUtilityMap("garbage line\nanother one").ok).toBe(true);
  });
});
