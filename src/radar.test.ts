import { describe, it, expect } from "vitest";
import { parseRadar } from "./radar";

describe("parseRadar", () => {
  it("parses axes with scores in source order", () => {
    const result = parseRadar("axis: Plan for change | 6\naxis: Decide fast | 4\naxis: Manage backlog | 7");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.axes).toEqual([
      { label: "Plan for change", score: 6 },
      { label: "Decide fast", score: 4 },
      { label: "Manage backlog", score: 7 },
    ]);
    expect(result.data.warnings).toBeUndefined();
  });

  it("splits on the last pipe so the statement may contain a pipe", () => {
    const result = parseRadar("axis: Build | ship fast | 8\naxis: Learn | 5\naxis: Adapt | 6");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.axes[0]).toEqual({ label: "Build | ship fast", score: 8 });
  });

  it("clamps out-of-range scores with a warning", () => {
    const result = parseRadar("axis: A | 12\naxis: B | -3\naxis: C | 5");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.axes.map(a => a.score)).toEqual([10, 0, 5]);
    expect(result.data.warnings).toHaveLength(2);
  });

  it("skips a missing/non-numeric score and a duplicate axis", () => {
    const result = parseRadar("axis: A\naxis: B | high\naxis: A | 4\naxis: C | 5\naxis: D | 6");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.axes.map(a => a.label)).toEqual(["A", "C", "D"]);
    expect((result.data.warnings ?? []).length).toBe(2);
  });

  it("warns and skips a line that is not an axis declaration", () => {
    const result = parseRadar("area: A | 5\naxis: B | 4\naxis: C | 6\naxis: D | 7");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.axes.map(a => a.label)).toEqual(["B", "C", "D"]);
    expect(result.data.warnings?.[0]).toMatch(/expected an "axis:" line/);
  });

  it("caps at 12 axes and warns once", () => {
    const src = Array.from({ length: 15 }, (_, i) => `axis: A${i} | 5`).join("\n");
    const result = parseRadar(src);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.axes).toHaveLength(12);
    expect((result.data.warnings ?? []).filter(w => /caps at 12/.test(w))).toHaveLength(1);
  });

  it("fails with fewer than three axes", () => {
    const result = parseRadar("axis: A | 5\naxis: B | 6");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/at least 3 axes/);
  });
});
