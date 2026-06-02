import { describe, it, expect } from "vitest";
import { parseOST } from "./frameworks/ost";

describe("parseOST", () => {
  it("parses a minimal outcome-only tree", () => {
    const result = parseOST("outcome: Grow revenue");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.root.text).toBe("Grow revenue");
    expect(result.data.root.level).toBe(0);
    expect(result.data.root.children).toHaveLength(0);
  });

  it("parses a full 4-level tree", () => {
    const src = `
outcome: Grow revenue
  opportunity: Increase conversion
    solution: Redesign checkout
      experiment: A/B test button colour
`.trim();
    const result = parseOST(src);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const opp = result.data.root.children[0];
    expect(opp.text).toBe("opportunity: Increase conversion");
    expect(opp.level).toBe(1);
    const sol = opp.children[0];
    expect(sol.level).toBe(2);
    expect(sol.children[0].level).toBe(3);
  });

  it("parsed OSTNode has no layout fields (x/y/width/height)", () => {
    const result = parseOST("outcome: Test");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.root).not.toHaveProperty("x");
    expect(result.data.root).not.toHaveProperty("y");
    expect(result.data.root).not.toHaveProperty("width");
    expect(result.data.root).not.toHaveProperty("height");
  });

  it("returns error for empty source", () => {
    const result = parseOST("");
    expect(result).toEqual({ ok: false, error: expect.stringContaining('"outcome:"') });
  });

  it("returns error when first line is not outcome:", () => {
    const result = parseOST("opportunity: Oops");
    expect(result).toEqual({ ok: false, error: expect.stringContaining("first line must be") });
  });

  it("returns error for duplicate outcome:", () => {
    const src = "outcome: A\noutcome: B";
    const result = parseOST(src);
    expect(result).toEqual({ ok: false, error: expect.stringContaining("duplicate") });
  });

  it("returns error for outcome: with empty label", () => {
    const result = parseOST("outcome:");
    expect(result).toEqual({ ok: false, error: expect.stringContaining("non-empty label") });
  });

  it("returns error when indentation exceeds max depth", () => {
    const src = "outcome: Root\n  l1\n    l2\n      l3\n        l4\n          too deep";
    const result = parseOST(src);
    expect(result.ok).toBe(false);
  });

  it("ignores blank lines and comments", () => {
    const src = "// comment\noutcome: Root\n\n  // child comment\n  opportunity: Opp";
    const result = parseOST(src);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.root.children).toHaveLength(1);
  });
});
