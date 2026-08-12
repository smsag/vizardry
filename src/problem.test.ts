import { describe, it, expect } from "vitest";
import { parseProblem } from "./problem";

describe("parseProblem — subtype resolution", () => {
  it("defaults to the engineering subtype when no variant is given", () => {
    const r = parseProblem("ideal: X");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.subtype).toBe("engineering");
    expect(r.data.stages.map(s => s.key)).toEqual(["ideal", "reality", "consequences", "proposal"]);
  });

  it("resolves an explicit subtype from the variant", () => {
    const r = parseProblem("vision: X", "business");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.subtype).toBe("business");
    expect(r.data.stages.map(s => s.key)).toEqual(["vision", "issue", "method"]);
  });

  it("errors on an unknown subtype and lists the valid ones", () => {
    const r = parseProblem("ideal: X", "astrology");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/unknown problem subtype/i);
    expect(r.error).toMatch(/engineering/);
  });
});

describe("parseProblem — nodes", () => {
  it("splits heading | body and keeps the body optional", () => {
    const r = parseProblem("ideal: Fast line | Assembles efficiently.\nreality: Manual transport");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.nodes).toEqual([
      { stage: "ideal", id: "fast line", heading: "Fast line", body: "Assembles efficiently." },
      { stage: "reality", id: "manual transport", heading: "Manual transport", body: undefined },
    ]);
  });

  it("keeps multiple nodes of the same stage in source order", () => {
    const r = parseProblem("reality: A\nreality: B\nreality: C");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.nodes.map(n => n.heading)).toEqual(["A", "B", "C"]);
  });

  it("warns and skips a keyword that is not a stage of the subtype", () => {
    const r = parseProblem("ideal: X\nprocess: not here");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.nodes).toHaveLength(1);
    expect(r.data.warnings?.some(w => /not a stage/.test(w))).toBe(true);
  });

  it("errors when there are no cards", () => {
    const r = parseProblem("// just a comment\nlink: a -> b");
    expect(r.ok).toBe(false);
  });
});

describe("parseProblem — links", () => {
  it("expands a & group into fan-out and merge edges (1→n, n→1)", () => {
    const src = [
      "ideal: I",
      "reality: R1",
      "reality: R2",
      "consequences: C",
      "link: I -> R1 & R2",
      "link: R1 & R2 -> C",
    ].join("\n");
    const r = parseProblem(src);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.edges).toEqual([
      { from: "i", to: "r1" },
      { from: "i", to: "r2" },
      { from: "r1", to: "c" },
      { from: "r2", to: "c" },
    ]);
  });

  it("expands a chain A -> B -> C into consecutive edges", () => {
    const r = parseProblem("ideal: A\nreality: B\nconsequences: C\nlink: A -> B -> C");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.edges).toEqual([{ from: "a", to: "b" }, { from: "b", to: "c" }]);
  });

  it("drops a dangling link with a warning", () => {
    const r = parseProblem("ideal: A\nlink: A -> Ghost");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.edges).toHaveLength(0);
    expect(r.data.warnings?.some(w => /unknown card "ghost"/i.test(w))).toBe(true);
  });

  it("dedupes identical edges and drops self-links", () => {
    const r = parseProblem("ideal: A\nreality: B\nlink: A -> B\nlink: A -> B\nlink: A -> A");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.edges).toEqual([{ from: "a", to: "b" }]);
    expect(r.data.warnings?.some(w => /self-link/.test(w))).toBe(true);
  });

  it("warns on a malformed link (no arrow)", () => {
    const r = parseProblem("ideal: A\nlink: A B");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.warnings?.some(w => /needs "A -> B"/.test(w))).toBe(true);
  });
});
