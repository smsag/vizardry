import { describe, it, expect } from "vitest";
import { parseMatrix } from "./matrix";

describe("parseMatrix", () => {
  // ── Presets ──────────────────────────────────────────────────────────────────

  it("fills axes and a heated 4×4 grid from the impact preset", () => {
    const r = parseMatrix("item: Fix [0.1,0.9]", "impact");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.preset).toBe("impact");
    expect(r.data.xAxis.ticks).toHaveLength(4);
    expect(r.data.yAxis.ticks).toHaveLength(4);
    expect(r.data.cells).toHaveLength(16);
    // t1 = top-left = the hot corner (quick win / important+unproven).
    const t1 = r.data.cells.find(c => c.id === "t1");
    expect(t1?.heat).toBe("very-high");
    const t16 = r.data.cells.find(c => c.id === "t16");
    expect(t16?.heat).toBe("low");
  });

  it("concentrates assumption heat in the top-left (gated, not diagonal)", () => {
    const r = parseMatrix("", "assumption");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const heat = (id: string) => r.data.cells.find(c => c.id === id)?.heat;
    expect(heat("t1")).toBe("very-high");   // important + no evidence
    expect(heat("t4")).toBe("low");          // important + strong evidence (top-right)
    expect(heat("t13")).toBe("low");         // unimportant + no evidence (bottom-left)
  });

  it("gives the scenario preset a 2×2 grid with no heat", () => {
    const r = parseMatrix("", "scenario");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.cells).toHaveLength(4);
    expect(r.data.cells.every(c => c.heat === undefined)).toBe(true);
  });

  it("errors on an unknown preset", () => {
    expect(parseMatrix("", "bogus")).toEqual({ ok: false, error: expect.stringContaining("Unknown preset") });
  });

  // ── Axes & cells ─────────────────────────────────────────────────────────────

  it("requires x and y axes when there is no preset", () => {
    expect(parseMatrix("item: A [0.5,0.5]")).toEqual({ ok: false, error: expect.stringContaining('"x:"') });
  });

  it("builds an N×M grid from custom tick counts", () => {
    const r = parseMatrix("x: Effort | Low | High\ny: Reach | Narrow | Wide");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.preset).toBeNull();
    expect(r.data.cells).toHaveLength(4); // 2×2
  });

  it("applies tN: name and heat overrides", () => {
    const r = parseMatrix("x: E | Lo | Hi\ny: R | Lo | Hi\nt1: Do first | very-high");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const t1 = r.data.cells.find(c => c.id === "t1");
    expect(t1?.name).toBe("Do first");
    expect(t1?.heat).toBe("very-high");
  });

  it("errors when a cell override targets a cell outside the grid", () => {
    const r = parseMatrix("x: E | Lo | Hi\ny: R | Lo | Hi\nt9: Ghost");
    expect(r).toEqual({ ok: false, error: expect.stringContaining("t1…t4") });
  });

  // ── Items ────────────────────────────────────────────────────────────────────

  it("parses a coordinate item with a card body", () => {
    const r = parseMatrix("item: Fix checkout [0.2, 0.8]\n  Wallet rejected", "impact");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.items[0]).toMatchObject({ label: "Fix checkout", x: 0.2, y: 0.8, content: "Wallet rejected" });
  });

  it("clamps coordinates to [0,1]", () => {
    const r = parseMatrix("item: Edge [1.4, -0.2]", "impact");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.items[0]).toMatchObject({ x: 1, y: 0 });
  });

  it("parses an item snapped to a cell", () => {
    const r = parseMatrix("item: Dark mode at: t7", "impact");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.items[0]).toMatchObject({ label: "Dark mode", at: "t7" });
    expect(r.data.items[0].x).toBeUndefined();
  });

  it("errors when an item has no position", () => {
    expect(parseMatrix("item: Nowhere", "impact")).toEqual({ ok: false, error: expect.stringContaining("position") });
  });

  it("errors when an item snaps to a cell outside the grid", () => {
    expect(parseMatrix("item: X at: t99", "scenario")).toEqual({ ok: false, error: expect.stringContaining("unknown cell") });
  });

  it("errors on a duplicate item label", () => {
    const r = parseMatrix("item: A [0.1,0.1]\nitem: a [0.2,0.2]", "impact");
    expect(r).toEqual({ ok: false, error: expect.stringContaining("duplicate") });
  });

  it("ignores title/comment lines", () => {
    const r = parseMatrix("title: My Matrix\n// a note\nitem: A [0.5,0.5]", "impact");
    expect(r.ok).toBe(true);
  });
});
