import { describe, it, expect } from "vitest";
import { parseOdyssey } from "./odyssey";

const TWO_PLANS = `plan: A | The Steady Climb
  year 1: Ship it
  gauge: Resources | 8
  question: Do I want this?
plan: B | Indie Maker
  year 2: Go full-time`;

describe("parseOdyssey", () => {
  // ── Happy paths ────────────────────────────────────────────────────────────

  it("parses plans with label, title, and children", () => {
    const result = parseOdyssey(TWO_PLANS);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.plans).toHaveLength(2);
    const a = result.data.plans[0];
    expect(a.label).toBe("A");
    expect(a.title).toBe("The Steady Climb");
    expect(a.milestones).toEqual([{ year: 1, text: "Ship it" }]);
    expect(a.gauges).toEqual([{ name: "Resources", value: 8 }]);
    expect(a.questions).toEqual(["Do I want this?"]);
    expect(result.data.warnings).toBeUndefined();
  });

  it("parses the archetype line", () => {
    const result = parseOdyssey("plan: A | X\n  archetype: Current path\nplan: B | Y");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.plans[0].archetype).toBe("Current path");
  });

  it("auto-letters plans when the label is omitted", () => {
    const result = parseOdyssey("plan: The Steady Climb\n  year 1: a\nplan: Indie Maker\n  year 1: b");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.plans.map(p => p.label)).toEqual(["A", "B"]);
    expect(result.data.plans[0].title).toBe("The Steady Climb");
  });

  it("accepts 'year N:' with or without a space and sorts milestones by year", () => {
    const result = parseOdyssey("plan: A | X\n  year 5: last\n  year1: first\n  year 3: mid\nplan: B | Y\n  year 1: y");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.plans[0].milestones.map(m => m.year)).toEqual([1, 3, 5]);
  });

  it("ignores blank, comment, title and collapsed lines", () => {
    const result = parseOdyssey("title: My Odyssey\n\n// note\nplan: A | X\n  year 1: a\ncollapsed: true\nplan: B | Y\n  year 1: b");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.plans).toHaveLength(2);
    expect(result.data.warnings).toBeUndefined();
  });

  // ── Graceful degradation ─────────────────────────────────────────────────────

  it("clamps out-of-range gauge values with a warning", () => {
    const result = parseOdyssey("plan: A | X\n  gauge: Resources | 15\nplan: B | Y\n  gauge: Confidence | -4");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.plans[0].gauges[0].value).toBe(10);
    expect(result.data.plans[1].gauges[0].value).toBe(0);
    expect(result.data.warnings).toHaveLength(2);
  });

  it("skips a gauge with a missing or non-numeric value", () => {
    const result = parseOdyssey("plan: A | X\n  gauge: Resources\n  gauge: Confidence | high\n  gauge: Coherence | 5\nplan: B | Y\n  year 1: y");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.plans[0].gauges).toEqual([{ name: "Coherence", value: 5 }]);
    expect(result.data.warnings).toHaveLength(2);
  });

  it("skips a duplicate year within a plan (first wins)", () => {
    const result = parseOdyssey("plan: A | X\n  year 1: first\n  year 1: second\nplan: B | Y\n  year 1: y");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.plans[0].milestones).toEqual([{ year: 1, text: "first" }]);
    expect(result.data.warnings?.[0]).toMatch(/duplicate year/);
  });

  it("warns and skips a keyword line before the first plan", () => {
    const result = parseOdyssey("year 1: orphan\nplan: A | X\n  year 1: a\nplan: B | Y\n  year 1: b");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.plans).toHaveLength(2);
    expect(result.data.warnings?.[0]).toMatch(/not inside a plan/);
  });

  it("warns on an unrecognised keyword inside a plan", () => {
    const result = parseOdyssey("plan: A | X\n  budget: 100\n  year 1: a\nplan: B | Y\n  year 1: b");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.warnings?.[0]).toMatch(/unrecognised keyword/);
  });

  it("caps at 4 plans and warns once", () => {
    const src = Array.from({ length: 6 }, (_, i) => `plan: P${i} | Title ${i}\n  year 1: a`).join("\n");
    const result = parseOdyssey(src);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.plans).toHaveLength(4);
    const capWarnings = (result.data.warnings ?? []).filter(w => /caps at 4/.test(w));
    expect(capWarnings).toHaveLength(1);
  });

  // ── Fatal cases ──────────────────────────────────────────────────────────────

  it("fails when fewer than two plans remain", () => {
    const result = parseOdyssey("plan: A | Only one\n  year 1: a");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/at least 2 life plans/);
  });

  it("fails on empty source", () => {
    expect(parseOdyssey("").ok).toBe(false);
  });
});
