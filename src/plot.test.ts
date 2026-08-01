import { describe, it, expect } from "vitest";
import { parsePlot } from "./plot";

describe("parsePlot", () => {
  const base = "x-axis: Effort | Low | High\ny-axis: Impact | Low | High\n";

  it("requires both axes", () => {
    const r = parsePlot("x-axis: Effort | Low | High");
    expect(r).toEqual({ ok: false, error: expect.stringContaining("both") });
  });

  it("parses inline axis ticks as evenly spaced positions", () => {
    const r = parsePlot("x-axis: Effort | Low | Mid | High\ny-axis: Impact | Lo | Hi");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.xAxis.ticks).toEqual([
      { pos: 0, label: "Low" },
      { pos: 0.5, label: "Mid" },
      { pos: 1, label: "High" },
    ]);
    expect(r.data.yAxis.ticks).toEqual([
      { pos: 0, label: "Lo" },
      { pos: 1, label: "Hi" },
    ]);
  });

  it("parses an indented tick list with explicit positions", () => {
    const r = parsePlot("x-axis: Effort\n  0.0 | Trivial\n  1.0 | Heroic\ny-axis: Impact | Low | High");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.xAxis.ticks).toEqual([
      { pos: 0, label: "Trivial" },
      { pos: 1, label: "Heroic" },
    ]);
  });

  it("parses items with coordinates and card bodies", () => {
    const r = parsePlot(base + "item: Fix checkout | x: 0.2, y: 0.8\n  Wallet rejected\n  Second line");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.items).toHaveLength(1);
    expect(r.data.items[0]).toMatchObject({ label: "Fix checkout", x: 0.2, y: 0.8 });
    expect(r.data.items[0].content).toBe("Wallet rejected\nSecond line");
  });

  it("clamps out-of-range coordinates to [0,1]", () => {
    const r = parsePlot(base + "item: Edge | x: 1.5, y: -0.3");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.items[0]).toMatchObject({ x: 1, y: 0 });
  });

  it("errors when an item has no coordinates", () => {
    const r = parsePlot(base + "item: Nowhere");
    expect(r).toEqual({ ok: false, error: expect.stringContaining("coordinates") });
  });

  it("errors on a duplicate item label", () => {
    const r = parsePlot(base + "item: A | x: 0.1, y: 0.1\nitem: a | x: 0.2, y: 0.2");
    expect(r).toEqual({ ok: false, error: expect.stringContaining("duplicate") });
  });

  it("parses a named-quadrant zone with heat", () => {
    const r = parsePlot(base + "zone: top-left | Quick wins | heat: very-high");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.zones[0]).toEqual({ rect: [0, 0.5, 0.5, 1], label: "Quick wins", heat: "very-high" });
  });

  it("parses a rect zone", () => {
    const r = parsePlot(base + "zone: rect 0,0 0.5,0.5 | Corner");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.zones[0]).toMatchObject({ rect: [0, 0, 0.5, 0.5], label: "Corner" });
  });

  it("errors on an unknown heat level", () => {
    const r = parsePlot(base + "zone: top-left | X | heat: scorching");
    expect(r).toEqual({ ok: false, error: expect.stringContaining("heat") });
  });

  it("errors on an unknown zone shape", () => {
    const r = parsePlot(base + "zone: circle 0.5 | X");
    expect(r).toEqual({ ok: false, error: expect.stringContaining("zone shape") });
  });

  it("errors on unexpected top-level syntax", () => {
    const r = parsePlot(base + "block: very-major-1");
    expect(r).toEqual({ ok: false, error: expect.stringContaining("unexpected syntax") });
  });

  it("ignores title/collapsed config lines", () => {
    const r = parsePlot("title: My Plot\ncollapsed: true\n" + base + "item: A | x: 0.5, y: 0.5");
    expect(r.ok).toBe(true);
  });
});
