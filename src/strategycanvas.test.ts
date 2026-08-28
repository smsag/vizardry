import { describe, expect, it } from "vitest";
import { parseStrategyCanvas } from "./strategycanvas";

function ok(src: string) {
  const r = parseStrategyCanvas(src);
  if (!r.ok) throw new Error(`expected ok, got error: ${r.error}`);
  return r.data;
}

describe("parseStrategyCanvas", () => {
  it("parses series and aligned factor scores", () => {
    const d = ok([
      "series: Us | Rival | Industry",
      "factor: Price | 8 | 3 | 9",
      "factor: Meals | 2 | 8 | 2",
    ].join("\n"));
    expect(d.series).toEqual(["Us", "Rival", "Industry"]);
    expect(d.factors.map(f => f.label)).toEqual(["Price", "Meals"]);
    expect(d.factors[0].scores).toEqual([8, 3, 9]);
  });

  it("infers series count and auto-labels when series: is omitted", () => {
    const d = ok([
      "factor: Price | 8 | 3",
      "factor: Meals | 2 | 8",
    ].join("\n"));
    expect(d.series).toEqual(["Series 1", "Series 2"]);
  });

  it("clamps out-of-range scores with a warning", () => {
    const d = ok([
      "series: Us",
      "factor: Price | 12",
      "factor: Meals | -3",
    ].join("\n"));
    expect(d.factors[0].scores).toEqual([10]);
    expect(d.factors[1].scores).toEqual([0]);
    expect(d.warnings?.some(w => w.includes("clamped"))).toBe(true);
  });

  it("treats a non-numeric score as a gap and warns", () => {
    const d = ok([
      "series: Us | Rival",
      "factor: Price | 8 | nope",
      "factor: Meals | 2 | 5",
    ].join("\n"));
    expect(d.factors[0].scores).toEqual([8, null]);
    expect(d.warnings?.some(w => w.includes("not a number"))).toBe(true);
  });

  it("pads short rows with gaps and drops overflow scores", () => {
    const d = ok([
      "series: Us | Rival | Industry",
      "factor: Price | 8",
      "factor: Meals | 2 | 8 | 2 | 9",
    ].join("\n"));
    expect(d.factors[0].scores).toEqual([8, null, null]);
    expect(d.factors[1].scores).toEqual([2, 8, 2]);
    expect(d.warnings?.some(w => w.includes("more scores"))).toBe(true);
  });

  it("skips duplicate factors with a warning", () => {
    const d = ok([
      "factor: Price | 8 | 3",
      "factor: price | 1 | 1",
      "factor: Meals | 2 | 8",
    ].join("\n"));
    expect(d.factors.map(f => f.label)).toEqual(["Price", "Meals"]);
    expect(d.warnings?.some(w => w.includes("duplicate"))).toBe(true);
  });

  it("is fatal with fewer than two factors", () => {
    const r = parseStrategyCanvas("series: Us\nfactor: Price | 8");
    expect(r.ok).toBe(false);
  });

  it("caps the number of series", () => {
    const d = ok([
      "series: A | B | C | D | E | F | G",
      "factor: One | 1 | 2 | 3 | 4 | 5 | 6 | 7",
      "factor: Two | 1 | 2 | 3 | 4 | 5 | 6 | 7",
    ].join("\n"));
    expect(d.series).toHaveLength(6);
  });
});
