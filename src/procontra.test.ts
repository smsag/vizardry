import { describe, it, expect } from "vitest";
import { parseProContra, splitWeight } from "./procontra";
import { proContraTotals, type ProContraData } from "./types/procontra";

function parse(src: string): ProContraData {
  const r = parseProContra(src);
  if (!r.ok) throw new Error(r.error);
  return r.data;
}

describe("splitWeight", () => {
  it("reads a trailing | n weight and defaults to 1", () => {
    expect(splitWeight("Cheaper | 3")).toEqual({ text: "Cheaper", weight: 3, clamped: false });
    expect(splitWeight("Cheaper")).toEqual({ text: "Cheaper", weight: 1, clamped: false });
  });

  it("clamps out-of-range weights and flags them", () => {
    expect(splitWeight("Huge | 9")).toEqual({ text: "Huge", weight: 3, clamped: true });
    expect(splitWeight("None | 0")).toEqual({ text: "None", weight: 1, clamped: true });
  });

  it("keeps a non-numeric | tail as part of the text", () => {
    expect(splitWeight("Either | or")).toEqual({ text: "Either | or", weight: 1, clamped: false });
  });
});

describe("parseProContra", () => {
  it("collects top-level pro/con lines into one implicit option", () => {
    const d = parse([
      "title: Buy a car?",
      "question: Should I buy a car this year?",
      "pro: Freedom on weekends | 3",
      "con: Insurance and parking | 2",
      "contra: Rarely needed in the city",
    ].join("\n"));
    expect(d.question).toBe("Should I buy a car this year?");
    expect(d.options).toHaveLength(1);
    const [o] = d.options;
    expect(o.name).toBe("");
    expect(o.ref).toBe(-1);
    expect(o.pros.map(a => a.text)).toEqual(["Freedom on weekends"]);
    expect(o.cons.map(a => [a.text, a.weight])).toEqual([["Insurance and parking", 2], ["Rarely needed in the city", 1]]);
    expect(proContraTotals(o)).toEqual({ pro: 3, con: 3, net: 0 });
    expect(d.warnings).toEqual([]);
  });

  it("groups arguments under options; indentation is cosmetic", () => {
    const d = parse([
      "option: Berlin",
      "  pro: Hiring pool | 3",
      "con: Cost | 2",
      "option: Remote",
      "    pro: No disruption | 2",
      "decision: Berlin",
    ].join("\n"));
    expect(d.options.map(o => [o.name, o.ref])).toEqual([["Berlin", 0], ["Remote", 1]]);
    expect(proContraTotals(d.options[0]).net).toBe(1);
    expect(d.options[1].pros[0].text).toBe("No disruption");
    expect(d.decision).toBe("Berlin");
  });

  it("numbers arguments in source order across options (the write-back handle)", () => {
    const d = parse("pro: a\noption: X\ncon: b\npro: c\noption: Y\npro: d");
    expect(d.options[0].pros[0].ref).toBe(0);
    expect(d.options[1].cons[0].ref).toBe(1);
    expect(d.options[1].pros[0].ref).toBe(2);
    expect(d.options[2].pros[0].ref).toBe(3);
  });

  it("keeps arguments before the first option as an untitled option", () => {
    const d = parse("pro: orphan\noption: Named\npro: x");
    expect(d.options.map(o => o.name)).toEqual(["", "Named"]);
  });

  it("degrades recoverable issues to warnings", () => {
    const d = parse([
      "type: procontra",
      "pro: Fine | 7",
      "pro:",
      "option:",
      "mood: great",
      "just text",
      "// a comment",
    ].join("\n"));
    expect(d.options[0].pros).toHaveLength(1);
    expect(d.options[0].pros[0].weight).toBe(3);
    expect(d.warnings).toEqual([
      "Line 2: weight must be 1–3 — clamped to 3",
      'Line 3: "pro:" has no text — ignored',
      'Line 4: "option:" has no name — ignored',
      'Line 5: unknown field "mood" — ignored',
      'Line 6: "just text" is not a "key: value" line — ignored',
    ]);
  });

  it("parses an empty block to no options", () => {
    expect(parse("title: Empty").options).toEqual([]);
  });
});
