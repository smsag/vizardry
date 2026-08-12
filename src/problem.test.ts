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

describe("parseProblem — nodes and ids", () => {
  it("splits heading | body, keeps the body optional, and derives id from the key", () => {
    const r = parseProblem("ideal: Fast line | Assembles efficiently.\nreality: Manual transport");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.nodes).toEqual([
      { stage: "ideal", id: "ideal_1", heading: "Fast line", body: "Assembles efficiently." },
      { stage: "reality", id: "reality_1", heading: "Manual transport", body: undefined },
    ]);
  });

  it("auto-numbers same-stage cards (stage_N) in source order", () => {
    const r = parseProblem("reality: A\nreality: B\nreality: C");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.nodes.map(n => n.id)).toEqual(["reality_1", "reality_2", "reality_3"]);
    expect(r.data.nodes.map(n => n.heading)).toEqual(["A", "B", "C"]);
  });

  it("honours an explicit stage_n id and auto-assigns around it without collision", () => {
    const r = parseProblem("reality_1: A\nreality: B");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // The bare `reality:` skips the taken reality_1 and becomes reality_2.
    expect(r.data.nodes.map(n => n.id)).toEqual(["reality_1", "reality_2"]);
  });

  it("warns on a duplicate explicit id", () => {
    const r = parseProblem("reality_1: A\nreality_1: B");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.warnings?.some(w => /duplicate key "reality_1"/.test(w))).toBe(true);
  });

  it("warns and skips a keyword whose prefix is not a stage of the subtype", () => {
    const r = parseProblem("ideal: X\nprocess_1: not here");
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
  it("resolves links by id and expands & groups into fan-out and merge edges", () => {
    const src = [
      "ideal_1: I",
      "reality_1: R1",
      "reality_2: R2",
      "consequences_1: C",
      "link: ideal_1 -> reality_1 & reality_2",
      "link: reality_1 & reality_2 -> consequences_1",
    ].join("\n");
    const r = parseProblem(src);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.edges).toEqual([
      { from: "ideal_1", to: "reality_1" },
      { from: "ideal_1", to: "reality_2" },
      { from: "reality_1", to: "consequences_1" },
      { from: "reality_2", to: "consequences_1" },
    ]);
  });

  it("expands a chain A -> B -> C into consecutive edges", () => {
    const r = parseProblem("ideal_1: A\nreality_1: B\nconsequences_1: C\nlink: ideal_1 -> reality_1 -> consequences_1");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.edges).toEqual([
      { from: "ideal_1", to: "reality_1" },
      { from: "reality_1", to: "consequences_1" },
    ]);
  });

  it("falls back to matching a link by heading text (back-compat)", () => {
    const r = parseProblem("ideal: Fully automated line\nreality: Manual transport\nlink: Fully automated line -> Manual transport");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.edges).toEqual([{ from: "ideal_1", to: "reality_1" }]);
  });

  it("drops a dangling link with a warning", () => {
    const r = parseProblem("ideal_1: A\nlink: ideal_1 -> ghost");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.edges).toHaveLength(0);
    expect(r.data.warnings?.some(w => /unknown card "ghost"/i.test(w))).toBe(true);
  });

  it("dedupes identical edges and drops self-links", () => {
    const r = parseProblem("ideal_1: A\nreality_1: B\nlink: ideal_1 -> reality_1\nlink: ideal_1 -> reality_1\nlink: ideal_1 -> ideal_1");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.edges).toEqual([{ from: "ideal_1", to: "reality_1" }]);
    expect(r.data.warnings?.some(w => /self-link/.test(w))).toBe(true);
  });

  it("warns on a malformed link (no arrow)", () => {
    const r = parseProblem("ideal_1: A\nlink: ideal_1 B");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.warnings?.some(w => /needs "A -> B"/.test(w))).toBe(true);
  });
});
