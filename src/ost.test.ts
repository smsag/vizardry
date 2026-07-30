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

  it("parses a full 5-level keyword tree, stripping each keyword", () => {
    const src = `
outcome: Grow revenue
  opportunity: Increase conversion
    solution: Redesign checkout
      experiment: A/B test button colour
        assumption: Colour drives clicks
`.trim();
    const result = parseOST(src);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const opp = result.data.root.children[0];
    expect(opp.text).toBe("Increase conversion");
    expect(opp.level).toBe(1);
    const sol = opp.children[0];
    expect(sol).toMatchObject({ text: "Redesign checkout", level: 2 });
    const exp = sol.children[0];
    expect(exp).toMatchObject({ text: "A/B test button colour", level: 3 });
    expect(exp.children[0]).toMatchObject({ text: "Colour drives clicks", level: 4 });
  });

  it("allows several opportunities, solutions, experiments and assumptions as siblings", () => {
    const src = `outcome: Grow revenue
  opportunity: Opp A
    solution: Sol A1
      experiment: Exp
        assumption: Ass 1
        assumption: Ass 2
    solution: Sol A2
  opportunity: Opp B`;
    const result = parseOST(src);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const opps = result.data.root.children;
    expect(opps.map(o => o.text)).toEqual(["Opp A", "Opp B"]);
    expect(opps[0].children.map(s => s.text)).toEqual(["Sol A1", "Sol A2"]);
    expect(opps[0].children[0].children[0].children.map(a => a.text)).toEqual(["Ass 1", "Ass 2"]);
  });

  it("rejects a solution that is not nested under an opportunity", () => {
    const result = parseOST("outcome: O\n  solution: Straight to a solution");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/must be nested under a "opportunity:"/);
  });

  it("rejects a keyword node that is not indented under its parent", () => {
    const result = parseOST("outcome: O\nopportunity: Not indented");
    expect(result.ok).toBe(false);
  });

  it("still parses legacy bare-indent trees (back-compat)", () => {
    const src = `outcome: Grow revenue
  Increase conversion
    Redesign checkout`;
    const result = parseOST(src);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const opp = result.data.root.children[0];
    expect(opp).toMatchObject({ text: "Increase conversion", level: 1 });
    expect(opp.children[0]).toMatchObject({ text: "Redesign checkout", level: 2 });
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
