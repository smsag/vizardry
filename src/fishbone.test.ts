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

  it("returns error when effect is missing", () => {
    const result = parseFishbone("category: C\n  cause: X");
    expect(result).toEqual({ ok: false, error: expect.stringContaining('"effect:"') });
  });

  it("returns error when cause has no parent category", () => {
    const result = parseFishbone("effect: E\n  cause: Orphan");
    expect(result).toEqual({ ok: false, error: expect.stringContaining("no parent category") });
  });

  it("returns error when subcause has no parent cause", () => {
    const result = parseFishbone("effect: E\ncategory: C\n  subcause: X");
    expect(result).toEqual({ ok: false, error: expect.stringContaining("no parent cause") });
  });

  it("returns error when effect is not at root level", () => {
    const result = parseFishbone("  effect: indented");
    expect(result).toEqual({ ok: false, error: expect.stringContaining("root level") });
  });

  it("returns error when category is not at root level", () => {
    const result = parseFishbone("effect: E\n  category: Indented");
    expect(result).toEqual({ ok: false, error: expect.stringContaining("root level") });
  });

  it("returns error for unexpected content", () => {
    const result = parseFishbone("effect: E\nunknown: X");
    expect(result).toEqual({ ok: false, error: expect.stringContaining("unexpected content") });
  });
});
