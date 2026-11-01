import { describe, it, expect } from "vitest";
import { accentHueExpr, analogousHueExpr } from "./accent-colors";

describe("analogousHueExpr", () => {
  it("starts at the accent and alternates either side within the spread", () => {
    expect([0, 1, 2].map(i => analogousHueExpr(i, 3))).toEqual([
      "var(--accent-h)", "calc(var(--accent-h) + 40)", "calc(var(--accent-h) + -40)",
    ]);
    expect([0, 1, 2, 3, 4].map(i => analogousHueExpr(i, 5))).toEqual([
      "var(--accent-h)", "calc(var(--accent-h) + 20)", "calc(var(--accent-h) + -20)",
      "calc(var(--accent-h) + 40)", "calc(var(--accent-h) + -40)",
    ]);
  });

  it("stays near the accent where an even rotation reaches the opposite side", () => {
    // Three plans from the default indigo (238°): even rotation gives 358° (red)
    // and 118° (green); the analogous band stays within ±40°.
    expect(accentHueExpr(1, 3)).toBe("calc(var(--accent-h) + 120)");
    expect(analogousHueExpr(1, 3)).toBe("calc(var(--accent-h) + 40)");
  });
});
