import { describe, it, expect } from "vitest";
import { parseScenario } from "./scenario";

const SRC = `title: Future of Mobility
x-axis: Energy price | Cheap | Expensive
y-axis: Autonomy | Slow | Fast

top-left: Gridlock
  Cars stay private
  Cities congest
top-right: Robo-taxis
  Fleets dominate
bottom-left: Status quo
bottom-right: Shared & electric
  Micromobility booms`;

describe("parseScenario", () => {
  it("parses axes with name | low | high", () => {
    const r = parseScenario(SRC);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.xAxis).toEqual({ name: "Energy price", low: "Cheap", high: "Expensive" });
    expect(r.data.yAxis).toEqual({ name: "Autonomy", low: "Slow", high: "Fast" });
  });

  it("parses quadrant names and card content", () => {
    const r = parseScenario(SRC);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.quadrants["top-left"]).toEqual({ name: "Gridlock", content: "Cars stay private\nCities congest" });
    expect(r.data.quadrants["top-right"]).toEqual({ name: "Robo-taxis", content: "Fleets dominate" });
    expect(r.data.quadrants["bottom-right"].name).toBe("Shared & electric");
  });

  it("allows an empty quadrant (name only, no detail)", () => {
    const r = parseScenario(SRC);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.quadrants["bottom-left"]).toEqual({ name: "Status quo", content: "" });
  });

  it("errors when an axis is missing a pole", () => {
    const r = parseScenario("x-axis: Only a name\ny-axis: A | B | C");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/needs "name \| low pole \| high pole"/);
  });

  it("errors when the x-axis is missing entirely", () => {
    const r = parseScenario("y-axis: A | B | C\ntop-left: X");
    expect(r).toEqual({ ok: false, error: expect.stringContaining('Missing "x-axis:') });
  });

  it("errors on an unexpected top-level line", () => {
    const r = parseScenario("x-axis: A | B | C\ny-axis: D | E | F\nnonsense here");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/expected "x-axis:", "y-axis:", or a quadrant/);
  });

  it("ignores type:, title: and // comment lines", () => {
    const r = parseScenario("type: scenario\ntitle: T\n// a note\nx-axis: A | B | C\ny-axis: D | E | F");
    expect(r.ok).toBe(true);
  });
});
