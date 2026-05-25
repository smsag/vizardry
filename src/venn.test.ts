import { describe, it, expect } from "vitest";
import { parseVennDiagram } from "./venn";

describe("parseVennDiagram", () => {
  it("parses a 2-circle diagram", () => {
    const src = "circle: A\n  - item 1\n\ncircle: B\n  - item 2";
    const result = parseVennDiagram(src);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.circles.map(c => c.name)).toEqual(["A", "B"]);
    expect(result.data.regions).toHaveLength(2);
  });

  it("parses a 3-circle diagram with intersection and center", () => {
    const src = `
circle: A
  - only A

circle: B
  - only B

circle: C
  - only C

intersection: A+B
  - shared AB

center:
  - all three
`.trim();
    const result = parseVennDiagram(src);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.circles).toHaveLength(3);
    const regionKeys = result.data.regions.map(r => r.key);
    expect(regionKeys).toContain("0+1");
    expect(regionKeys).toContain("0+1+2");
  });

  it("intersection is order-insensitive", () => {
    const src = "circle: A\n  - a\ncircle: B\n  - b\nintersection: B+A\n  - both";
    const result = parseVennDiagram(src);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.regions.find(r => r.key === "0+1")?.items[0].text).toBe("both");
  });

  it("parses [[Note|Alias]] links", () => {
    const src = "circle: A\n  - [[MyNote|Alias text]]\ncircle: B\n  - plain";
    const result = parseVennDiagram(src);
    expect(result.ok && result.data.regions[0].items[0]).toEqual({
      text: "Alias text",
      linkTarget: "MyNote",
    });
  });

  it("parses [[Note]] without alias", () => {
    const src = "circle: A\n  - [[MyNote]]\ncircle: B\n  - plain";
    const result = parseVennDiagram(src);
    expect(result.ok && result.data.regions[0].items[0]).toEqual({
      text: "MyNote",
      linkTarget: "MyNote",
    });
  });

  it("returns error for fewer than 2 circles", () => {
    const result = parseVennDiagram("circle: A\n  - item");
    expect(result).toEqual({ ok: false, error: expect.stringContaining("At least 2") });
  });

  it("returns error for more than 3 circles", () => {
    const src = "circle: A\n  - a\ncircle: B\n  - b\ncircle: C\n  - c\ncircle: D\n  - d";
    const result = parseVennDiagram(src);
    expect(result).toEqual({ ok: false, error: expect.stringContaining("maximum 3") });
  });

  it("returns error for unknown circle in intersection", () => {
    const src = "circle: A\n  - a\ncircle: B\n  - b\nintersection: A+Z\n  - x";
    const result = parseVennDiagram(src);
    expect(result).toEqual({ ok: false, error: expect.stringContaining('unknown circle "Z"') });
  });

  it("returns error for center: with fewer than 3 circles", () => {
    const src = "circle: A\n  - a\ncircle: B\n  - b\ncenter:\n  - all";
    const result = parseVennDiagram(src);
    expect(result).toEqual({ ok: false, error: expect.stringContaining('"center:" is only valid') });
  });

  it("returns error for duplicate circle in intersection", () => {
    const src = "circle: A\n  - a\ncircle: B\n  - b\nintersection: A+A\n  - x";
    const result = parseVennDiagram(src);
    expect(result).toEqual({ ok: false, error: expect.stringContaining("duplicate circle") });
  });

  it("returns error for item without parent section", () => {
    const result = parseVennDiagram("  - orphan");
    expect(result).toEqual({ ok: false, error: expect.stringContaining("item without a parent") });
  });

  it("ignores regions with no items", () => {
    const src = "circle: A\ncircle: B\n  - item";
    const result = parseVennDiagram(src);
    expect(result.ok && result.data.regions).toHaveLength(1);
  });
});
