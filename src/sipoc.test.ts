import { describe, it, expect } from "vitest";
import { parseSIPOC } from "./sipoc";

const MINIMAL = `
suppliers:
  Vendor A

inputs:
  Raw material

process:
  Step one

outputs:
  Product

customers:
  End user
`.trim();

describe("parseSIPOC", () => {
  it("parses a complete valid diagram", () => {
    const result = parseSIPOC(MINIMAL);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.suppliers).toEqual(["Vendor A"]);
    expect(result.data.inputs).toEqual(["Raw material"]);
    expect(result.data.process).toEqual(["Step one"]);
    expect(result.data.outputs).toEqual(["Product"]);
    expect(result.data.customers).toEqual(["End user"]);
  });

  it("parses multiple items per section", () => {
    const src = "suppliers:\n  A\n  B\ninputs:\nprocess:\noutputs:\ncustomers:";
    const result = parseSIPOC(src);
    expect(result.ok && result.data.suppliers).toEqual(["A", "B"]);
  });

  it("accepts sections without trailing colon", () => {
    const result = parseSIPOC("suppliers\n  A\ninputs\nprocess\noutputs\ncustomers");
    expect(result.ok).toBe(true);
  });

  it("returns empty arrays for sections with no items", () => {
    const result = parseSIPOC("suppliers:\ninputs:\nprocess:\noutputs:\ncustomers:");
    expect(result.ok && result.data.suppliers).toEqual([]);
  });

  it("ignores blank lines and comments", () => {
    const src = "# comment\nsuppliers:\n  A\n\ninputs:\nprocess:\noutputs:\ncustomers:";
    const result = parseSIPOC(src);
    expect(result.ok).toBe(true);
  });

  it("returns error for unknown section", () => {
    const result = parseSIPOC("unknown:\n  item");
    expect(result).toEqual({ ok: false, error: expect.stringContaining("unknown section") });
  });

  it("returns error for item before any section header", () => {
    const result = parseSIPOC("  orphan item");
    expect(result).toEqual({ ok: false, error: expect.stringContaining("item before any section") });
  });
});
