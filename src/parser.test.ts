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

  it("rejects a block label declared twice instead of silently discarding the first one's content", () => {
    const result = parseFrameworkSource("block: Goal\n  First\n\nblock: Goal\n  Second");
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/duplicate.*block: Goal/i);
  });

  it("treats duplicate block labels as case-insensitive", () => {
    const result = parseFrameworkSource("block: Goal\n  First\n\nblock: GOAL\n  Second");
    expect(result.ok).toBe(false);
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

  it("returns error for an unknown cards: value", () => {
    const result = parseFrameworkSource("cards: sometimes\nblock: Goal\n  value");
    expect(result).toEqual({ ok: false, error: expect.stringContaining('Unknown value "sometimes" for "cards:"') });
  });

  it("returns error for unexpected indentation at root", () => {
    const result = parseFrameworkSource("  block: Goal");
    expect(result).toEqual({ ok: false, error: expect.stringContaining("unexpected indentation") });
  });

  it("returns error for block without a label", () => {
    const result = parseFrameworkSource("block:\n  value");
    expect(result).toEqual({ ok: false, error: expect.stringContaining('"block:" requires a label') });
  });

  it("returns error for unknown root-level syntax", () => {
    const result = parseFrameworkSource("unknown: foo");
    expect(result).toEqual({ ok: false, error: expect.stringContaining("unexpected syntax") });
  });

});
