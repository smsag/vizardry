import { describe, it, expect } from "vitest";
import { parseFrameworkSource } from "./parser";

describe("parseFrameworkSource", () => {
  it("parses a single block", () => {
    const result = parseFrameworkSource("block: Goal\n  Make money");
    expect(result).toEqual({ ok: true, data: { goal: "Make money" }, links: {} });
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

  it("allows empty block content", () => {
    const result = parseFrameworkSource("block: Goal\n");
    expect(result).toEqual({ ok: true, data: { goal: "" }, links: {} });
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
