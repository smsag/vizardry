import { describe, it, expect } from "vitest";
import { parseFishbone } from "./fishbone";

const MINIMAL = `
effect: Slow checkout

category: Technology
  cause: API latency
    subcause: Unoptimized queries
`.trim();

describe("parseFishbone", () => {
  it("parses a minimal valid diagram", () => {
    const result = parseFishbone(MINIMAL);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.effect).toBe("Slow checkout");
    expect(result.data.categories).toHaveLength(1);
    expect(result.data.categories[0].name).toBe("Technology");
    expect(result.data.categories[0].causes[0].name).toBe("API latency");
    expect(result.data.categories[0].causes[0].subcauses).toEqual([{ name: "Unoptimized queries" }]);
    expect(result.data.warnings).toBeUndefined();
  });

  it("parses multiple categories, causes, and subcauses", () => {
    const src = `
effect: High error rate

category: People
  cause: Lack of training
    subcause: No onboarding
  cause: High turnover

category: Process
  cause: Manual testing
`.trim();
    const result = parseFishbone(src);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.categories).toHaveLength(2);
    expect(result.data.categories[0].causes).toHaveLength(2);
    expect(result.data.categories[0].causes[0].subcauses).toEqual([{ name: "No onboarding" }]);
    expect(result.data.categories[1].causes[0].name).toBe("Manual testing");
  });

  it("ignores blank lines, comment lines, and title lines", () => {
    const src = [
      "// comment",
      "title: My Fishbone",
      "",
      "effect: Problem",
      "",
      "// another comment",
      "category: Environment",
      "  cause: Remote work",
    ].join("\n");
    const result = parseFishbone(src);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.effect).toBe("Problem");
    expect(result.data.categories[0].name).toBe("Environment");
  });

  it("allows an effect with no categories", () => {
    const result = parseFishbone("effect: Just the effect");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.categories).toHaveLength(0);
  });

  it("allows causes with no subcauses", () => {
    const src = "effect: E\ncategory: C\n  cause: Cause A";
    const result = parseFishbone(src);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.categories[0].causes[0].subcauses).toHaveLength(0);
  });

  it("is fatal only when effect is missing", () => {
    const result = parseFishbone("category: C\n  cause: X");
    expect(result).toEqual({ ok: false, error: expect.stringContaining('"effect:"') });
  });

  // ── Graceful degradation ────────────────────────────────────────────────────

  it("skips an orphan cause with a warning instead of failing", () => {
    const result = parseFishbone("effect: E\ncause: Orphan");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.categories).toHaveLength(0);
    expect(result.data.warnings?.some(w => w.includes("no parent category"))).toBe(true);
  });

  it("skips an orphan subcause with a warning", () => {
    const result = parseFishbone("effect: E\ncategory: C\nsubcause: X");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.categories[0].causes).toHaveLength(0);
    expect(result.data.warnings?.some(w => w.includes("no parent cause"))).toBe(true);
  });

  it("skips an unrecognised line with a warning", () => {
    const result = parseFishbone("effect: E\nunknown: X");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.warnings?.some(w => w.includes("ignored"))).toBe(true);
  });

  it("treats indentation as cosmetic (indented effect/category still parse)", () => {
    const result = parseFishbone("  effect: Indented\n  category: C\n    cause: X");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.effect).toBe("Indented");
    expect(result.data.categories[0].causes[0].name).toBe("X");
  });

  it("keeps the first effect and warns on a duplicate", () => {
    const result = parseFishbone("effect: First\neffect: Second");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.effect).toBe("First");
    expect(result.data.warnings?.some(w => w.includes("duplicate"))).toBe(true);
  });

  // ── Category presets ─────────────────────────────────────────────────────────

  it("seeds the 6M preset category bones", () => {
    const result = parseFishbone("effect: Line stops", "6m");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.categories.map(c => c.name)).toEqual([
      "People", "Method", "Machine", "Material", "Measurement", "Environment",
    ]);
  });

  it("merges causes into a matching preset bone by name", () => {
    const result = parseFishbone("effect: Line stops\ncategory: Machine\n  cause: Old PLC", "6m");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.categories).toHaveLength(6); // no extra bone appended
    const machine = result.data.categories.find(c => c.name === "Machine")!;
    expect(machine.causes[0].name).toBe("Old PLC");
  });

  it("warns on an unknown preset and falls back to a blank diagram", () => {
    const result = parseFishbone("effect: E", "nonsense");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.categories).toHaveLength(0);
    expect(result.data.warnings?.some(w => w.includes("Unknown fishbone preset"))).toBe(true);
  });
});
