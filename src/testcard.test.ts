import { describe, it, expect } from "vitest";
import { parseTestCard } from "./testcard";

function ok(source: string) {
  const r = parseTestCard(source);
  if (!r.ok) throw new Error(r.error);
  return r.data;
}

const FULL = [
  "title: Pricing test",
  "deadline: 2026-09-01",
  "hypothesis: SMBs will pay",
  "critical: 3",
  "test: Run a paywall test",
  "cost: 2",
  "reliability: 2",
  "metric: Paid conversion",
  "time: 1",
  "criteria: Conversion > 5%",
].join("\n");

describe("parseTestCard", () => {
  it("always returns the four fixed steps with their prompts, in order", () => {
    const d = ok("hypothesis: X");
    expect(d.steps.map(s => s.key)).toEqual(["hypothesis", "test", "metric", "criteria"]);
    expect(d.steps[0].prompt).toBe("We believe that");
    expect(d.steps[3].prompt).toBe("We are right if");
  });

  it("fills in each step's text and leaves the rest empty", () => {
    const d = ok("hypothesis: SMBs will pay\ncriteria: Conversion > 5%");
    expect(d.steps[0].text).toBe("SMBs will pay");
    expect(d.steps[1].text).toBe("");
    expect(d.steps[3].text).toBe("Conversion > 5%");
  });

  it("reads the deadline", () => {
    expect(ok(FULL).deadline).toBe("2026-09-01");
  });

  it("attaches the right gauges to the right steps with their levels", () => {
    const d = ok(FULL);
    expect(d.steps[0].gauges).toEqual([{ key: "critical", label: "Critical", level: 3 }]);
    expect(d.steps[1].gauges.map(g => [g.key, g.level])).toEqual([["cost", 2], ["reliability", 2]]);
    expect(d.steps[2].gauges).toEqual([{ key: "time", label: "Time required", level: 1 }]);
    expect(d.steps[3].gauges).toEqual([]);
  });

  it("defaults an unset gauge to level 0", () => {
    const d = ok("hypothesis: X");
    expect(d.steps[0].gauges[0].level).toBe(0);
  });

  it("clamps a gauge above the max and rounds", () => {
    const d = ok("critical: 9");
    expect(d.steps[0].gauges[0].level).toBe(3);
  });

  it("warns (and skips) a non-numeric gauge without failing the card", () => {
    const d = ok("critical: high");
    expect(d.steps[0].gauges[0].level).toBe(0);
    expect(d.warnings.some(w => /critical/.test(w))).toBe(true);
  });

  it("warns on an unknown field but still parses the card", () => {
    const d = ok("hypothesis: X\nbogus: line");
    expect(d.steps[0].text).toBe("X");
    expect(d.warnings.some(w => /bogus/.test(w))).toBe(true);
  });

  it("ignores order and indented lines", () => {
    const d = ok("criteria: last\n  test: indented not a field\nhypothesis: first");
    expect(d.steps[0].text).toBe("first");
    expect(d.steps[3].text).toBe("last");
    expect(d.steps[1].text).toBe(""); // the indented test: is not top-level
  });
});
