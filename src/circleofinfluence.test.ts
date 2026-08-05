import { describe, it, expect } from "vitest";
import { parseCircleOfInfluence } from "./circleofinfluence";

describe("parseCircleOfInfluence", () => {
  it("parses items into their tiers in source order", () => {
    const result = parseCircleOfInfluence("concern: The economy\ninfluence: Team morale\ncontrol: My effort");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.items).toEqual([
      { tier: "concern", text: "The economy" },
      { tier: "influence", text: "Team morale" },
      { tier: "control", text: "My effort" },
    ]);
    expect(result.data.warnings).toBeUndefined();
  });

  it("supports the classic two-tier diagram (no control)", () => {
    const result = parseCircleOfInfluence("concern: The weather\ninfluence: My response");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.items.some(i => i.tier === "control")).toBe(false);
  });

  it("ignores blank, comment, title and collapsed lines", () => {
    const result = parseCircleOfInfluence("title: Mind\n\n// note\nconcern: A\ncollapsed: true\ninfluence: B");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.items).toHaveLength(2);
    expect(result.data.warnings).toBeUndefined();
  });

  it("warns and skips an unrecognised keyword", () => {
    const result = parseCircleOfInfluence("worry: A\nconcern: B\ninfluence: C");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.items).toHaveLength(2);
    expect(result.data.warnings?.[0]).toMatch(/expected concern:, influence:, or control:/);
  });

  it("skips an empty item", () => {
    const result = parseCircleOfInfluence("concern:  \nconcern: A\ninfluence: B");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.items).toHaveLength(2);
    expect(result.data.warnings?.[0]).toMatch(/empty concern/);
  });

  it("caps a tier at 8 items with a warning", () => {
    const src = Array.from({ length: 10 }, (_, i) => `concern: C${i}`).join("\n") + "\ninfluence: X";
    const result = parseCircleOfInfluence(src);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.items.filter(i => i.tier === "concern")).toHaveLength(8);
    expect((result.data.warnings ?? []).some(w => /already has 8/.test(w))).toBe(true);
  });

  it("fails with fewer than two items", () => {
    const result = parseCircleOfInfluence("concern: Only one");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/at least 2 items/);
  });
});
