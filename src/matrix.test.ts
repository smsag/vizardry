import { describe, it, expect } from "vitest";
import { parseMatrix } from "./matrix";

describe("parseMatrix", () => {
  // ── Scanned type: line (no override) ──────────────────────────────────────

  it("defaults to type pain when no type: line is present", () => {
    const result = parseMatrix("block: very-major-1\n  X");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.type).toBe("pain");
  });

  it("parses type: opportunity", () => {
    const result = parseMatrix("type: opportunity\nblock: very-major-1\n  X");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.type).toBe("opportunity");
  });

  it("parses type: impact", () => {
    const result = parseMatrix("type: impact\nblock: very-major-1\n  X");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.type).toBe("impact");
  });

  it("parses type: assumption", () => {
    const result = parseMatrix("type: assumption\nblock: very-major-1\n  X");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.type).toBe("assumption");
  });

  it("returns an error for an unknown scanned type value", () => {
    const result = parseMatrix("type: bogus\nblock: very-major-1\n  X");
    expect(result).toEqual({ ok: false, error: expect.stringContaining('Unknown type "bogus"') });
  });

  it("blanks the consumed type: line instead of removing it, keeping line numbers stable", () => {
    // If the line were removed rather than blanked, "block:" would be on
    // line 1 instead of line 2, and this deliberately-bad line would be
    // reported as line 2 instead of line 3.
    const result = parseMatrix("type: pain\nblock:\n  X");
    expect(result).toEqual({ ok: false, error: expect.stringContaining("Line 2") });
  });

  // ── typeOverride (dispatcher-supplied, from a compound "type: matrix, X" line) ──

  it("uses typeOverride instead of scanning source for its own type: line", () => {
    const result = parseMatrix("block: very-major-1\n  X", "opportunity");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.type).toBe("opportunity");
  });

  it("validates typeOverride the same way a scanned value would be", () => {
    const result = parseMatrix("block: very-major-1\n  X", "bogus");
    expect(result).toEqual({ ok: false, error: expect.stringContaining('Unknown type "bogus"') });
  });

  it("typeOverride is case-insensitive", () => {
    const result = parseMatrix("block: very-major-1\n  X", "Impact");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.type).toBe("impact");
  });

  it("ignores a type: line in source when typeOverride is provided", () => {
    // The dispatcher already blanked the outer line before calling in with
    // an override, but even an inner type: line left in place must not be
    // scanned once an override is supplied.
    const result = parseMatrix("type: pain\nblock: very-major-1\n  X", "impact");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.type).toBe("impact");
  });

  // ── Delegation to parseFrameworkSource ──────────────────────────────────────

  it("parses block content via the shared grid parser", () => {
    const result = parseMatrix("type: pain\nblock: very-major-1\n  Checkout fails on mobile");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.data["very-major-1"]).toBe("Checkout fails on mobile");
  });

  it("propagates cardBlocks and allCards from the shared grid parser", () => {
    const result = parseMatrix("cards: all\ntype: pain\nblock: very-major-1\n  X");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.allCards).toBe(true);
  });

  // ── Optional axis-title overrides (x-axis:/y-axis:) ──────────────────────────

  it("leaves axis titles undefined when not specified", () => {
    const result = parseMatrix("type: impact\nblock: very-major-1\n  X");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.xAxis).toBeUndefined();
    expect(result.data.yAxis).toBeUndefined();
  });

  it("extracts x-axis: and y-axis: title overrides", () => {
    const result = parseMatrix("type: impact\nx-axis: Reach\ny-axis: Value\nblock: very-major-1\n  X");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.xAxis).toBe("Reach");
    expect(result.data.yAxis).toBe("Value");
    // The override lines must not reach the grid parser as stray blocks.
    expect(result.data.data["very-major-1"]).toBe("X");
  });

  it("tolerates a scenario-style pole suffix, keeping only the axis name", () => {
    const result = parseMatrix("type: impact\nx-axis: Reach | few | many\nblock: very-major-1\n  X");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.xAxis).toBe("Reach");
  });

  // ── layout: grid | plot ──────────────────────────────────────────────────────

  it("defaults layout to grid", () => {
    const result = parseMatrix("type: impact\nblock: very-major-1\n  X");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.layout).toBe("grid");
    expect(result.data.plot).toBeUndefined();
  });

  it("errors on an unknown layout", () => {
    const result = parseMatrix("type: impact\nlayout: bogus\nblock: very-major-1\n  X");
    expect(result).toEqual({ ok: false, error: expect.stringContaining("unknown layout") });
  });

  it("routes layout: plot to the plot parser, not the grid parser", () => {
    const src = "type: impact\nlayout: plot\nx-axis: Effort | Low | High\ny-axis: Impact | Low | High\nitem: A | x: 0.2, y: 0.8";
    const result = parseMatrix(src);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.layout).toBe("plot");
    expect(result.data.plot?.items[0]).toMatchObject({ label: "A", x: 0.2, y: 0.8 });
    // Grid fields stay empty in plot mode.
    expect(Object.keys(result.data.data)).toHaveLength(0);
  });
});
