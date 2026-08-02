import { describe, it, expect } from "vitest";
import { parseOST } from "./frameworks/ost";

describe("parseOST", () => {
  it("parses a minimal outcome-only tree", () => {
    const result = parseOST("outcome: Grow revenue");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.root.text).toBe("Grow revenue");
    expect(result.data.root.level).toBe(0);
    expect(result.data.root.key).toBe("outcome");
    expect(result.data.root.children).toHaveLength(0);
  });

  it("parses the full outcome→opportunity→solution→experiment chain, stripping each keyword", () => {
    const src = `
outcome: Grow revenue
  need: Increase conversion
    solution: Redesign checkout
      experiment: A/B test button colour
`.trim();
    const result = parseOST(src);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const opp = result.data.root.children[0];
    expect(opp).toMatchObject({ text: "Increase conversion", level: 1, key: "need" });
    const sol = opp.children[0];
    expect(sol).toMatchObject({ text: "Redesign checkout", level: 2, key: "solution" });
    expect(sol.children[0]).toMatchObject({ text: "A/B test button colour", level: 3, key: "experiment" });
  });

  it("accepts need / pain / desire as siblings in the opportunity lane (all level 1)", () => {
    const src = `outcome: O
  need: I want tenants who pay on time
  pain: I feel anxious about paperwork
  desire: I'd like tenant reviews`;
    const result = parseOST(src);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const opps = result.data.root.children;
    expect(opps.map(o => o.level)).toEqual([1, 1, 1]);
    expect(opps.map(o => o.key)).toEqual(["need", "pain", "desire"]);
  });

  it("allows several opportunities and solutions as siblings", () => {
    const src = `outcome: Grow revenue
  need: Opp A
    solution: Sol A1
      experiment: Exp
    solution: Sol A2
  desire: Opp B`;
    const result = parseOST(src);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const opps = result.data.root.children;
    expect(opps.map(o => o.text)).toEqual(["Opp A", "Opp B"]);
    expect(opps[0].children.map(s => s.text)).toEqual(["Sol A1", "Sol A2"]);
  });

  it("collects bare indented lines as bullets on the enclosing node", () => {
    const src = `outcome: O
  need: N
    solution: Provide a platform
      Tenant credit checks
      Background checks
      experiment: Usability testing`;
    const result = parseOST(src);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const sol = result.data.root.children[0].children[0];
    expect(sol.bullets).toEqual(["Tenant credit checks", "Background checks"]);
    // A keyworded line under the same solution is still a child, not a bullet.
    expect(sol.children.map(c => c.text)).toEqual(["Usability testing"]);
  });

  it("allows bullets on any node, including the outcome", () => {
    const src = `outcome: O
  Context note one
  Context note two
  need: N`;
    const result = parseOST(src);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.root.bullets).toEqual(["Context note one", "Context note two"]);
    expect(result.data.root.children.map(c => c.key)).toEqual(["need"]);
  });

  it("skips a mis-nested solution (with a warning) instead of failing the whole canvas", () => {
    const result = parseOST("outcome: O\n  solution: Straight to a solution");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.root.children).toHaveLength(0);
    expect(result.data.warnings?.some(w => /"need:"/.test(w) && /skipped/.test(w))).toBe(true);
  });

  it("skips a keyword node that isn't indented under its parent, with a warning", () => {
    const result = parseOST("outcome: O\nneed: Not indented");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.root.children).toHaveLength(0);
    expect(result.data.warnings?.some(w => /skipped/.test(w))).toBe(true);
  });

  it("treats a dropped legacy keyword as plain bullet text (breaking change)", () => {
    // `opportunity:`/`assumption:` are no longer keywords; a legacy line now
    // falls through to a bullet rather than an opportunity node.
    const result = parseOST("outcome: O\n  opportunity: Old keyword");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.root.children).toHaveLength(0);
    expect(result.data.root.bullets).toEqual(["opportunity: Old keyword"]);
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
    const result = parseOST("need: Oops");
    expect(result).toEqual({ ok: false, error: expect.stringContaining("first line must be") });
  });

  it("ignores a duplicate outcome: with a warning (first wins)", () => {
    const result = parseOST("outcome: A\noutcome: B");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.root.text).toBe("A");
    expect(result.data.warnings?.some(w => /duplicate/i.test(w))).toBe(true);
  });

  it("renders an empty outcome: label as a placeholder node with a warning", () => {
    const result = parseOST("outcome:");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.root.text).toBe("");
    expect(result.data.warnings?.some(w => /no text/i.test(w))).toBe(true);
  });

  it("ignores blank lines and comments", () => {
    const src = "// comment\noutcome: Root\n\n  // child comment\n  need: Opp";
    const result = parseOST(src);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.root.children).toHaveLength(1);
  });
});
