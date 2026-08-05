import { describe, it, expect } from "vitest";
import { parseFrameworkSource } from "./parser";

describe("parseFrameworkSource", () => {
  it("parses a single block", () => {
    const result = parseFrameworkSource("block: Goal\n  Make money");
    expect(result).toEqual({ ok: true, data: { goal: "Make money" }, links: {}, cardBlocks: new Set(), allCards: false });
  });

  it("parses multiple blocks", () => {
    const src = "block: Key Partners\n  Supplier A\n\nblock: Channels\n  Direct sales";
    const result = parseFrameworkSource(src);
    expect(result.ok && result.data).toMatchObject({
      "key partners": "Supplier A",
      "channels": "Direct sales",
    });
  });

  it("normalises block label keys to lowercase", () => {
    const result = parseFrameworkSource("block: Value Propositions\n  Best product");
    expect(result.ok && result.data["value propositions"]).toBe("Best product");
  });

  it("strips trailing blank lines from block content", () => {
    const result = parseFrameworkSource("block: Goal\n  Line one\n\n");
    expect(result.ok && result.data["goal"]).toBe("Line one");
  });

  it("parses multi-line block content", () => {
    const result = parseFrameworkSource("block: Goal\n  Line one\n  Line two");
    expect(result.ok && result.data["goal"]).toBe("Line one\nLine two");
  });

  it("ignores comment lines", () => {
    const result = parseFrameworkSource("// top comment\nblock: Goal\n  // inner comment\n  Value");
    expect(result.ok && result.data["goal"]).toBe("Value");
  });

  it("ignores a top-level period: config line without warning", () => {
    const result = parseFrameworkSource("period: May – Jul 2025\nblock: Goal\n  Value");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual({ goal: "Value" });
    expect(result.warnings).toBeUndefined();
  });

  it("keeps the first of a block declared twice (later skipped) with a warning", () => {
    const result = parseFrameworkSource("block: Goal\n  First\n\nblock: Goal\n  Second");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.goal).toBe("First");
    expect(result.warnings?.some(w => /duplicate.*block: Goal/i.test(w))).toBe(true);
  });

  it("treats duplicate block labels as case-insensitive (first wins, warns)", () => {
    const result = parseFrameworkSource("block: Goal\n  First\n\nblock: GOAL\n  Second");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.goal).toBe("First");
    expect(result.warnings?.some(w => /duplicate/i.test(w))).toBe(true);
  });

  it("allows empty block content", () => {
    const result = parseFrameworkSource("block: Goal\n");
    expect(result).toEqual({ ok: true, data: { goal: "" }, links: {}, cardBlocks: new Set(), allCards: false });
  });

  it("parses | card modifier and strips it from the key", () => {
    const result = parseFrameworkSource("block: Next Experiment | card\n  Run A/B test");
    expect(result.ok && result.data).toMatchObject({ "next experiment": "Run A/B test" });
    expect(result.ok && result.cardBlocks).toEqual(new Set(["next experiment"]));
  });

  it("ignores | bullets (and any other unknown modifier) silently", () => {
    const result = parseFrameworkSource("block: Obstacles | bullets\n  Too slow");
    expect(result.ok && result.data).toMatchObject({ obstacles: "Too slow" });
    expect(result.ok && result.cardBlocks).toEqual(new Set());
  });

  it("ignores unknown modifiers silently", () => {
    const result = parseFrameworkSource("block: Goal | fancy\n  value");
    expect(result.ok && result.data).toMatchObject({ goal: "value" });
    expect(result.ok && result.cardBlocks).toEqual(new Set());
  });

  it("| card modifier is case-insensitive", () => {
    const result = parseFrameworkSource("block: Goal | Card\n  value");
    expect(result.ok && result.cardBlocks).toEqual(new Set(["goal"]));
  });

  it("parses cards: all as a canvas-wide flag", () => {
    const result = parseFrameworkSource("cards: all\nblock: Goal\n  value");
    expect(result.ok && result.allCards).toBe(true);
    expect(result.ok && result.data).toMatchObject({ goal: "value" });
  });

  it("cards: all is case-insensitive", () => {
    const result = parseFrameworkSource("Cards: All\nblock: Goal\n  value");
    expect(result.ok && result.allCards).toBe(true);
  });

  it("defaults allCards to false when cards: is absent", () => {
    const result = parseFrameworkSource("block: Goal\n  value");
    expect(result.ok && result.allCards).toBe(false);
  });

  it("ignores an unknown cards: value with a warning (allCards stays false)", () => {
    const result = parseFrameworkSource("cards: sometimes\nblock: Goal\n  value");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.allCards).toBe(false);
    expect(result.data.goal).toBe("value");
    expect(result.warnings?.some(w => /cards:/.test(w))).toBe(true);
  });

  it("skips an unexpectedly-indented root line with a warning", () => {
    const result = parseFrameworkSource("  block: Goal");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings?.some(w => /unexpected indentation/.test(w))).toBe(true);
  });

  it("skips a block without a label (dropping its content) with a warning", () => {
    const result = parseFrameworkSource("block:\n  value\nblock: Goal\n  real");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual({ goal: "real" });
    expect(result.warnings?.some(w => /has no label/.test(w))).toBe(true);
  });

  it("skips an unknown root-level line with a warning", () => {
    const result = parseFrameworkSource("unknown: foo\nblock: Goal\n  real");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual({ goal: "real" });
    expect(result.warnings?.some(w => /unexpected line/.test(w))).toBe(true);
  });

});
