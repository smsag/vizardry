import { describe, it, expect } from "vitest";
import { parseWholePerson } from "./wholeperson";

describe("parseWholePerson", () => {
  it("parses dimensions with score and activities", () => {
    const result = parseWholePerson("body: 6 | Run | Sleep\nmind: 7 | Read");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const body = result.data.entries.find(e => e.dimension === "body")!;
    expect(body).toEqual({ dimension: "body", score: 6, activities: ["Run", "Sleep"] });
    const mind = result.data.entries.find(e => e.dimension === "mind")!;
    expect(mind.activities).toEqual(["Read"]);
  });

  it("always emits the four dimensions in canonical order, defaulting omitted ones to 0", () => {
    const result = parseWholePerson("spirit: 4\nbody: 8");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.entries.map(e => e.dimension)).toEqual(["body", "mind", "heart", "spirit"]);
    expect(result.data.entries.find(e => e.dimension === "mind")).toEqual({ dimension: "mind", score: 0, activities: [] });
  });

  it("accepts a score with no activities", () => {
    const result = parseWholePerson("body: 5\nmind: 9");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.entries.find(e => e.dimension === "body")!.activities).toEqual([]);
  });

  it("clamps out-of-range scores with a warning", () => {
    const result = parseWholePerson("body: 12\nmind: -2");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.entries.find(e => e.dimension === "body")!.score).toBe(10);
    expect(result.data.entries.find(e => e.dimension === "mind")!.score).toBe(0);
    expect(result.data.warnings).toHaveLength(2);
  });

  it("skips a dimension with a missing or non-numeric score", () => {
    const result = parseWholePerson("body:\nmind: high\nheart: 5");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // heart provided; body/mind skipped (default 0), so only heart is non-zero.
    expect(result.data.entries.find(e => e.dimension === "heart")!.score).toBe(5);
    expect(result.data.entries.find(e => e.dimension === "body")!.score).toBe(0);
    expect(result.data.warnings).toHaveLength(2);
  });

  it("skips a duplicate dimension (first wins)", () => {
    const result = parseWholePerson("body: 3\nbody: 9\nmind: 5");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.entries.find(e => e.dimension === "body")!.score).toBe(3);
    expect(result.data.warnings?.[0]).toMatch(/duplicate "body"/);
  });

  it("warns on an unrecognised keyword", () => {
    const result = parseWholePerson("soul: 5\nbody: 6\nmind: 7");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.warnings?.[0]).toMatch(/expected body:, mind:, heart:, or spirit:/);
  });

  it("caps activities at 5", () => {
    const result = parseWholePerson("body: 6 | a | b | c | d | e | f\nmind: 5");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.entries.find(e => e.dimension === "body")!.activities).toHaveLength(5);
    expect((result.data.warnings ?? []).some(w => /more than 5 activities/.test(w))).toBe(true);
  });

  it("fails when no dimension is given", () => {
    const result = parseWholePerson("// nothing here");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/at least one dimension/);
  });
});
