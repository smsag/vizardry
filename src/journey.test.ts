import { describe, it, expect } from "vitest";
import { parseJourney } from "./journey";

const MINIMAL = `
phase: Awareness
  action: Receives email
`.trim();

describe("parseJourney", () => {
  it("parses a minimal valid map", () => {
    const result = parseJourney(MINIMAL);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.variant).toBe("journey");
    expect(result.data.phases[0].name).toBe("Awareness");
    expect(result.data.phases[0].lanes.action).toEqual([{ name: "Receives email", subtitle: "" }]);
  });

  it("parses persona and scenario metadata", () => {
    const src = `persona: Alice\nscenario: Reordering\n${MINIMAL}`;
    const result = parseJourney(src);
    expect(result.ok && result.data.persona).toBe("Alice");
    expect(result.ok && result.data.scenario).toBe("Reordering");
  });

  it("parses a lane card subtitle separated by |", () => {
    const src = "phase: A\n  feeling: Confused | Didn't expect this";
    const result = parseJourney(src);
    expect(result.ok && result.data.phases[0].lanes.feeling).toEqual([
      { name: "Confused", subtitle: "Didn't expect this" },
    ]);
  });

  it("stacks multiple cards for the same lane keyword in source order", () => {
    const src = "phase: A\n  action: First\n  action: Second\n  action: Third";
    const result = parseJourney(src);
    expect(result.ok && result.data.phases[0].lanes.action?.map(c => c.name)).toEqual([
      "First", "Second", "Third",
    ]);
  });

  it("allows duplicate card names within a lane", () => {
    const src = "phase: A\n  painpoint: Slow\n  painpoint: Slow";
    const result = parseJourney(src);
    expect(result.ok).toBe(true);
    expect(result.ok && result.data.phases[0].lanes.painpoint).toHaveLength(2);
  });

  it("defaults to the journey variant when typeOverride is undefined", () => {
    const result = parseJourney(MINIMAL);
    expect(result.ok && result.data.variant).toBe("journey");
  });

  it("resolves the blueprint variant from typeOverride", () => {
    const result = parseJourney(MINIMAL, "blueprint");
    expect(result.ok && result.data.variant).toBe("blueprint");
  });

  it("falls back to the journey variant for an unknown typeOverride, with a warning", () => {
    const result = parseJourney(MINIMAL, "flow");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.variant).toBe("journey");
    expect(result.data.warnings?.some(w => /Unknown variant/.test(w))).toBe(true);
  });

  it("parses frontstage/backstage/support lines regardless of variant (round-trip safety)", () => {
    const src = "phase: A\n  action: Do thing\n  frontstage: Greet\n  backstage: Log\n  support: Queue";
    const journeyResult = parseJourney(src, undefined);
    const blueprintResult = parseJourney(src, "blueprint");
    expect(journeyResult.ok && journeyResult.data.phases[0].lanes.frontstage).toEqual([{ name: "Greet", subtitle: "" }]);
    expect(blueprintResult.ok && blueprintResult.data.phases[0].lanes.frontstage).toEqual([{ name: "Greet", subtitle: "" }]);
  });

  it("allows lane keywords to be interleaved within a phase", () => {
    const src = "phase: A\n  action: A1\n  painpoint: P1\n  action: A2\n  painpoint: P2";
    const result = parseJourney(src);
    expect(result.ok && result.data.phases[0].lanes.action?.map(c => c.name)).toEqual(["A1", "A2"]);
    expect(result.ok && result.data.phases[0].lanes.painpoint?.map(c => c.name)).toEqual(["P1", "P2"]);
  });

  it("ignores blank lines and comments", () => {
    const src = "// top\nphase: A\n  // mid\n  action: Do thing";
    const result = parseJourney(src);
    expect(result.ok).toBe(true);
  });

  it("keeps a nameless phase as an empty column with a warning", () => {
    const result = parseJourney("phase:\n  action: Do thing");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.phases).toHaveLength(1);
    expect(result.data.phases[0].name).toBe("");
    expect(result.data.warnings?.some(w => /no name/.test(w))).toBe(true);
  });

  it("merges duplicate phase names with a warning", () => {
    const src = "phase: Dup\n  action: A\nphase: Dup\n  action: B";
    const result = parseJourney(src);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.phases).toHaveLength(1);
    expect(result.data.phases[0].lanes.action?.map(c => c.name)).toEqual(["A", "B"]);
    expect(result.data.warnings?.some(w => /more than once/.test(w))).toBe(true);
  });

  it("returns error when no phases are defined", () => {
    const result = parseJourney("persona: Alice");
    expect(result).toEqual({ ok: false, error: expect.stringContaining('"phase:"') });
  });

  it("allows an empty phase with no lane lines", () => {
    const result = parseJourney("phase: Empty");
    expect(result.ok).toBe(true);
    expect(result.ok && result.data.phases[0].lanes).toEqual({});
  });

  it("skips an unexpected root-level line with a warning", () => {
    const result = parseJourney("phase: A\n  action: X\nbadkey: Y");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.phases).toHaveLength(1);
    expect(result.data.warnings?.some(w => /unexpected line/.test(w))).toBe(true);
  });

  it("skips an unknown lane keyword with a warning", () => {
    const result = parseJourney("phase: A\n  bogus: X");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.warnings?.some(w => /unknown lane keyword/.test(w))).toBe(true);
  });

  it("skips indented content before any phase, keeping later phases, with a warning", () => {
    const result = parseJourney("  action: Orphan\nphase: A\n  action: Real");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.phases[0].lanes.action?.map(c => c.name)).toEqual(["Real"]);
    expect(result.data.warnings?.some(w => /outside a phase/.test(w))).toBe(true);
  });

  it("skips a lane line with no text, keeping valid siblings, with a warning", () => {
    const result = parseJourney("phase: A\n  action:\n  action: Real");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.phases[0].lanes.action?.map(c => c.name)).toEqual(["Real"]);
    expect(result.data.warnings?.some(w => /no text/.test(w))).toBe(true);
  });
});
