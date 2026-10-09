import { describe, it, expect } from "vitest";
import { collapseGridLayout, expandTracks, parseTemplate, type GridLayout } from "./grid-layout";
import { ALL_FRAMEWORKS } from "../frameworks-registry";

const SWOT: GridLayout = { template: '"sw wk" "op th"', columns: "repeat(2, 1fr)", rows: "repeat(2, 1fr)" };
const collapse = (layout: GridLayout, areas: string[]): GridLayout => collapseGridLayout(layout, new Set(areas));

describe("expandTracks", () => {
  it("expands repeat()", () => {
    expect(expandTracks("repeat(3, 1fr)")).toEqual(["1fr", "1fr", "1fr"]);
    expect(expandTracks("auto repeat(2, 1fr auto) 2fr")).toEqual(["auto", "1fr", "auto", "1fr", "auto", "2fr"]);
  });

  it("keeps functions with spaces as one track", () => {
    expect(expandTracks("minmax(120px, 1.2fr) 1fr")).toEqual(["minmax(120px, 1.2fr)", "1fr"]);
  });

  it("rejects unbalanced parentheses", () => {
    expect(expandTracks("minmax(1fr")).toBeNull();
  });
});

describe("collapseGridLayout — SWOT", () => {
  it("drops the empty bottom row when Opportunities and Threats are left out", () => {
    expect(collapse(SWOT, ["sw", "wk"])).toEqual({ template: '"sw wk"', columns: "1fr 1fr", rows: "1fr" });
  });

  it("drops the empty right column when Weaknesses and Threats are left out", () => {
    expect(collapse(SWOT, ["sw", "op"])).toEqual({ template: '"sw" "op"', columns: "1fr", rows: "1fr 1fr" });
  });

  it("widens diagonal blocks into the empty cells beside them", () => {
    expect(collapse(SWOT, ["sw", "th"])).toEqual({ template: '"sw sw" "th th"', columns: "1fr 1fr", rows: "1fr 1fr" });
  });

  it("widens a lone block in a row", () => {
    expect(collapse(SWOT, ["sw", "wk", "th"]).template).toBe('"sw wk" "th th"');
  });

  it("leaves a complete layout unchanged", () => {
    expect(collapse(SWOT, ["sw", "wk", "op", "th"])).toEqual({ template: '"sw wk" "op th"', columns: "1fr 1fr", rows: "1fr 1fr" });
  });

  it("returns the layout unchanged when nothing is present", () => {
    expect(collapse(SWOT, [])).toBe(SWOT);
  });

  it("returns the layout unchanged when the tracks don't match the template", () => {
    const odd: GridLayout = { ...SWOT, rows: "1fr" };
    expect(collapse(odd, ["sw"])).toBe(odd);
  });
});

describe("collapseGridLayout — every grid framework", () => {
  /** True when every area in the template is one rectangle. */
  function rectangular(template: string): boolean {
    const grid = parseTemplate(template)!;
    const areas = new Set(grid.flat().filter((a) => a !== "."));
    for (const area of areas) {
      const cells: Array<[number, number]> = [];
      grid.forEach((r, ri) => r.forEach((a, ci) => { if (a === area) cells.push([ri, ci]); }));
      const rs = cells.map((c) => c[0]), cs = cells.map((c) => c[1]);
      const h = Math.max(...rs) - Math.min(...rs) + 1, w = Math.max(...cs) - Math.min(...cs) + 1;
      if (h * w !== cells.length) return false;
    }
    return true;
  }

  const grids = ALL_FRAMEWORKS.filter((f) => "gridTemplate" in f && f.blocks?.length) as Array<
    { id: string; gridTemplate: string; gridColumns: string; gridRows: string; blocks: { area: string }[] }>;

  it.each(grids.map((f) => [f.id, f] as const))("%s: any set of omitted blocks keeps a valid grid", (_id, f) => {
    const layout = { template: f.gridTemplate, columns: f.gridColumns, rows: f.gridRows };
    const areas = f.blocks.map((b) => b.area);
    // The framework's own definition must be readable, or nothing collapses.
    expect(collapseGridLayout(layout, new Set(areas.slice(1)))).not.toBe(layout);
    // Every non-empty subset of blocks (2^n − 1; at most 1023 for 10 blocks).
    for (let mask = 1; mask < 1 << areas.length; mask++) {
      const kept = areas.filter((_, i) => mask & (1 << i));
      const out = collapseGridLayout(layout, new Set(kept));
      const grid = parseTemplate(out.template)!;
      expect(rectangular(out.template), `${f.id} keeping ${kept.join(",")}`).toBe(true);
      expect(expandTracks(out.columns)!.length).toBe(grid[0]!.length);
      expect(expandTracks(out.rows)!.length).toBe(grid.length);
      for (const a of areas) expect(grid.flat().includes(a)).toBe(kept.includes(a));
    }
  });
});
