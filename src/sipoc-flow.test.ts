import { describe, it, expect } from "vitest";
import { parseSIPOCFlow } from "./sipoc-flow";

const MINIMAL = `
suppliers:
  Vendor A [ellipse]

inputs:
  Raw data [parallelogram]

process:
  Step 1 [rect]

outputs:
  Report [parallelogram]

customers:
  End user [ellipse]

link: Vendor A -> Raw data
link: Raw data -> Step 1
link: Step 1 -> Report
link: Report -> End user
`.trim();

describe("parseSIPOCFlow", () => {
  it("parses a complete valid diagram", () => {
    const result = parseSIPOCFlow(MINIMAL);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.nodes).toHaveLength(5);
    expect(result.data.links).toHaveLength(4);
  });

  it("assigns correct column and shape to each node", () => {
    const result = parseSIPOCFlow(MINIMAL);
    if (!result.ok) return;
    const vendor = result.data.nodes.find(n => n.label === "Vendor A")!;
    expect(vendor.shape).toBe("ellipse");
    expect(vendor.column).toBe("suppliers");
    const step = result.data.nodes.find(n => n.label === "Step 1")!;
    expect(step.shape).toBe("rect");
    expect(step.column).toBe("process");
  });

  it("normalises node ids for link lookup (case-insensitive matching)", () => {
    const src = `
suppliers:
  Vendor A [ellipse]
inputs:
  Raw Data [parallelogram]
process:
outputs:
customers:
link: vendor a -> raw data
`.trim();
    const result = parseSIPOCFlow(src);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.links[0]).toEqual({ from: "vendor a", to: "raw data" });
  });

  it("allows unlinked nodes", () => {
    const src = `
suppliers:
  Alone [ellipse]
inputs:
process:
outputs:
customers:
`.trim();
    const result = parseSIPOCFlow(src);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.links).toHaveLength(0);
  });

  it("allows backward links", () => {
    const src = `
suppliers:
  A [ellipse]
inputs:
  B [parallelogram]
process:
outputs:
customers:
link: B -> A
`.trim();
    const result = parseSIPOCFlow(src);
    expect(result.ok).toBe(true);
  });

  it("ignores blank lines and comments", () => {
    const src = `// header\nsuppliers:\n  A [ellipse]\n\ninputs:\nprocess:\noutputs:\ncustomers:`;
    const result = parseSIPOCFlow(src);
    expect(result.ok).toBe(true);
  });

  it("returns error for node missing shape brackets", () => {
    const result = parseSIPOCFlow("suppliers:\n  No shape");
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("shape") });
  });

  it("returns error for unknown shape", () => {
    const result = parseSIPOCFlow("suppliers:\n  X [starfish]");
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("starfish") });
  });

  it("returns error for unknown section", () => {
    const result = parseSIPOCFlow("unknown:\n  A [rect]");
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("unknown section") });
  });

  it("returns error for duplicate node name", () => {
    const result = parseSIPOCFlow("suppliers:\n  A [ellipse]\ninputs:\n  A [parallelogram]\nprocess:\noutputs:\ncustomers:");
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("duplicate") });
  });

  it("returns error for link referencing unknown node", () => {
    const result = parseSIPOCFlow("suppliers:\n  A [ellipse]\ninputs:\nprocess:\noutputs:\ncustomers:\nlink: A -> Ghost");
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("ghost") });
  });

  it("returns error for link missing arrow", () => {
    const result = parseSIPOCFlow("suppliers:\n  A [ellipse]\ninputs:\nprocess:\noutputs:\ncustomers:\nlink: A to B");
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("->") });
  });

  it("returns error when no nodes defined", () => {
    const result = parseSIPOCFlow("// just a comment");
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("No nodes") });
  });

  it("parses all new shape keywords without error", () => {
    const src = [
      "suppliers:",
      "  S1 [diamond]",
      "  S2 [cylinder]",
      "  S3 [document]",
      "inputs:",
      "  I1 [trapezoid]",
      "  I2 [pentagon]",
      "  I3 [circle]",
      "process:",
      "  P1 [hexagon]",
      "outputs:",
      "customers:",
    ].join("\n");
    const result = parseSIPOCFlow(src);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const shapes = result.data.nodes.map(n => n.shape);
    expect(shapes).toContain("diamond");
    expect(shapes).toContain("cylinder");
    expect(shapes).toContain("document");
    expect(shapes).toContain("trapezoid");
    expect(shapes).toContain("pentagon");
    expect(shapes).toContain("circle");
    expect(shapes).toContain("hexagon");
  });
});
