import { describe, it, expect } from "vitest";
import { parseWheelOfLife } from "./wheeloflife";

describe("parseWheelOfLife", () => {
  // ── Happy paths ────────────────────────────────────────────────────────────

  it("parses areas with scores in source order", () => {
    const result = parseWheelOfLife("area: Career | 7\narea: Health | 4");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.areas).toEqual([
      { name: "Career", score: 7 },
      { name: "Health", score: 4 },
    ]);
    expect(result.data.warnings).toBeUndefined();
  });

  it("parses an optional note after the score", () => {
    const result = parseWheelOfLife("area: Career | 7 | Going well\narea: Health | 4");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.areas[0]).toEqual({ name: "Career", score: 7, note: "Going well" });
  });

  it("keeps '|' characters inside a note", () => {
    const result = parseWheelOfLife("area: Career | 7 | work | life balance\narea: Health | 4");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.areas[0].note).toBe("work | life balance");
  });

  it("accepts decimal scores", () => {
    const result = parseWheelOfLife("area: Career | 6.5\narea: Health | 4");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.areas[0].score).toBe(6.5);
  });

  it("ignores blank, comment, title and collapsed lines", () => {
    const result = parseWheelOfLife("title: My Wheel\n\n// a comment\narea: Career | 7\ncollapsed: true\narea: Health | 4");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.areas).toHaveLength(2);
    expect(result.data.warnings).toBeUndefined();
  });

  // ── Graceful degradation ─────────────────────────────────────────────────────

  it("clamps out-of-range scores into 0–10 with a warning", () => {
    const result = parseWheelOfLife("area: Career | 12\narea: Health | -3");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.areas[0].score).toBe(10);
    expect(result.data.areas[1].score).toBe(0);
    expect(result.data.warnings).toHaveLength(2);
  });

  it("skips an area with a missing score", () => {
    const result = parseWheelOfLife("area: Career\narea: Health | 4\narea: Family | 8");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.areas.map(a => a.name)).toEqual(["Health", "Family"]);
    expect(result.data.warnings?.[0]).toMatch(/Career/);
  });

  it("skips an area with a non-numeric score", () => {
    const result = parseWheelOfLife("area: Career | high\narea: Health | 4\narea: Family | 8");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.areas.map(a => a.name)).toEqual(["Health", "Family"]);
    expect(result.data.warnings?.[0]).toMatch(/not a number/);
  });

  it("skips an area with a blank name", () => {
    const result = parseWheelOfLife("area:  | 5\narea: Health | 4\narea: Family | 8");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.areas.map(a => a.name)).toEqual(["Health", "Family"]);
    expect(result.data.warnings?.[0]).toMatch(/missing a name/);
  });

  it("skips a duplicate area (case-insensitive)", () => {
    const result = parseWheelOfLife("area: Career | 7\narea: career | 3\narea: Health | 4");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.areas.map(a => a.name)).toEqual(["Career", "Health"]);
    expect(result.data.warnings?.[0]).toMatch(/duplicate/);
  });

  it("warns and skips a line that is not an area declaration", () => {
    const result = parseWheelOfLife("box: Career | 7\narea: Health | 4\narea: Family | 8");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.areas.map(a => a.name)).toEqual(["Health", "Family"]);
    expect(result.data.warnings?.[0]).toMatch(/expected an "area:" line/);
  });

  it("caps at 12 areas and warns once", () => {
    const src = Array.from({ length: 15 }, (_, i) => `area: A${i} | 5`).join("\n");
    const result = parseWheelOfLife(src);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.areas).toHaveLength(12);
    const capWarnings = (result.data.warnings ?? []).filter(w => /caps at 12/.test(w));
    expect(capWarnings).toHaveLength(1);
  });

  // ── Fatal cases ──────────────────────────────────────────────────────────────

  it("fails when fewer than two usable areas remain", () => {
    const result = parseWheelOfLife("area: Career | 7");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/at least 2 areas/);
  });

  it("fails on empty source", () => {
    const result = parseWheelOfLife("");
    expect(result.ok).toBe(false);
  });
});
