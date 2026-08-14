import { describe, it, expect } from "vitest";
import { parseCompass } from "./compass";

function ok(source: string) {
  const r = parseCompass(source);
  if (!r.ok) throw new Error(r.error);
  return r.data;
}

describe("parseCompass", () => {
  it("collects repeatable sections in source order", () => {
    const d = ok([
      "forces: A", "forces: B",
      "idea: One", "idea: Two", "idea: Three",
      "gtm: G1", "gtm: G2",
      "pricing: P1",
    ].join("\n"));
    expect(d.forces).toEqual(["A", "B"]);
    expect(d.ideas).toEqual(["One", "Two", "Three"]);
    expect(d.gtm).toEqual(["G1", "G2"]);
    expect(d.pricing).toEqual(["P1"]);
  });

  it("takes only the first north star (single guiding outcome)", () => {
    const d = ok("northstar: First\nnorthstar: Second");
    expect(d.northStar).toBe("First");
  });

  it("splits an insight on the first | into figure + text; no | → text only", () => {
    const d = ok("insight: 40% | of shops abandon\ninsight: 12 interviews all cite steps");
    expect(d.insights).toEqual([
      { figure: "40%", text: "of shops abandon" },
      { figure: "", text: "12 interviews all cite steps" },
    ]);
  });

  it("accepts sensible aliases", () => {
    const d = ok("force: F\nproblem statement: P\ncase: 3× | churn\nnorth star: N\nsolution: S\ngo-to-market: M\nprice: $9");
    expect(d.forces).toEqual(["F"]);
    expect(d.problem).toEqual(["P"]);
    expect(d.insights[0]).toEqual({ figure: "3×", text: "churn" });
    expect(d.northStar).toBe("N");
    expect(d.ideas).toEqual(["S"]);
    expect(d.gtm).toEqual(["M"]);
    expect(d.pricing).toEqual(["$9"]);
  });

  it("warns on an unknown field but still parses the rest", () => {
    const d = ok("idea: Real\nbogus: line");
    expect(d.ideas).toEqual(["Real"]);
    expect(d.warnings.some(w => /bogus/.test(w))).toBe(true);
  });

  it("ignores indented lines, blanks, comments, and empty values", () => {
    const d = ok("idea: Keep\n  idea: indented not top-level\n\n// comment\ngtm:");
    expect(d.ideas).toEqual(["Keep"]);
    expect(d.gtm).toEqual([]);
  });
});
