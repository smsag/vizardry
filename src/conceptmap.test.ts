import { describe, it, expect } from "vitest";
import { parseConceptMap } from "./conceptmap";

describe("parseConceptMap", () => {
  // ── Happy paths ────────────────────────────────────────────────────────────

  it("parses a single labeled edge", () => {
    const result = parseConceptMap("A -- causes --> B");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.nodes).toEqual(["A", "B"]);
    expect(result.data.edges).toEqual([{ from: "A", to: "B", label: "causes" }]);
  });

  it("parses a single unlabeled edge", () => {
    const result = parseConceptMap("A --> B");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.edges).toEqual([{ from: "A", to: "B", label: "" }]);
  });

  it("parses mixed labeled and unlabeled edges", () => {
    const result = parseConceptMap("A -- leads to --> B\nB --> C");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.edges).toHaveLength(2);
    expect(result.data.edges[0].label).toBe("leads to");
    expect(result.data.edges[1].label).toBe("");
  });

  it("collects nodes in insertion order without duplicates", () => {
    const result = parseConceptMap("A --> B\nB --> C\nA --> C");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.nodes).toEqual(["A", "B", "C"]);
  });

  it("allows multiple edges between the same pair of nodes", () => {
    const result = parseConceptMap("A -- causes --> B\nA -- enables --> B");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.edges).toHaveLength(2);
    expect(result.data.nodes).toEqual(["A", "B"]);
  });

  it("ignores blank lines", () => {
    const result = parseConceptMap("\nA --> B\n\nB --> C\n");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.edges).toHaveLength(2);
  });

  it("ignores // comment lines", () => {
    const result = parseConceptMap("// this is a comment\nA --> B");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.nodes).toEqual(["A", "B"]);
  });

  it("ignores title: line", () => {
    const result = parseConceptMap("title: My Map\nA --> B");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.nodes).toEqual(["A", "B"]);
  });

  it("accepts multi-word node names with spaces", () => {
    const result = parseConceptMap("Photosynthesis -- requires --> Solar Energy");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.nodes).toContain("Photosynthesis");
    expect(result.data.nodes).toContain("Solar Energy");
  });

  it("parses a graph with more than two nodes", () => {
    const src = [
      "A -- leads to --> B",
      "B -- enables --> C",
      "C -- supports --> D",
    ].join("\n");
    const result = parseConceptMap(src);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.nodes).toHaveLength(4);
    expect(result.data.edges).toHaveLength(3);
  });

  // ── Error paths ────────────────────────────────────────────────────────────

  it("returns error for empty source", () => {
    const result = parseConceptMap("");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/no edges/i);
  });

  it("returns error for source with only comments and blanks", () => {
    const result = parseConceptMap("// comment\n\n// another");
    expect(result.ok).toBe(false);
  });

  it("returns error for a self-loop", () => {
    const result = parseConceptMap("A --> A");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/self-loop/i);
  });

  it("returns error for a labeled self-loop", () => {
    const result = parseConceptMap("A -- reflects --> A");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/self-loop/i);
  });

  it("returns error for an unrecognised line", () => {
    const result = parseConceptMap("A --> B\nthis is garbage");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/line 2/i);
  });

  it("includes the offending line number in the error", () => {
    const result = parseConceptMap("A --> B\n\nbad line here");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/line 3/i);
  });
});
