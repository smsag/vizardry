import { describe, it, expect } from "vitest";
import { parseSIPOC } from "./sipoc";

const MINIMAL = `
row:
  supplier: Vendor A
  input: Raw material
  process: Step one
  output: Product
  customer: End user
`.trim();

describe("parseSIPOC", () => {
  it("parses a single complete row", () => {
    const result = parseSIPOC(MINIMAL);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.rows).toHaveLength(1);
    expect(result.data.rows[0]).toEqual({
      supplier: "Vendor A",
      input: "Raw material",
      process: "Step one",
      output: "Product",
      customer: "End user",
      owner: "",
      metric: "",
    });
  });

  it("parses multiple rows", () => {
    const src = `
row:
  supplier: A
  input: X
  process: P1
  output: Y
  customer: C1

row:
  supplier: B
  input: Z
  process: P2
  output: W
  customer: C2
`.trim();
    const result = parseSIPOC(src);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.rows).toHaveLength(2);
    expect(result.data.rows[1].supplier).toBe("B");
  });

  it("allows rows with missing cells (renders as empty)", () => {
    const src = `row:\n  supplier: Only supplier`;
    const result = parseSIPOC(src);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.rows[0].input).toBe("");
    expect(result.data.rows[0].customer).toBe("");
  });

  it("ignores blank lines and comments", () => {
    const src = `// comment\n\nrow:\n  supplier: A\n  // another comment\n  customer: Z`;
    const result = parseSIPOC(src);
    expect(result.ok).toBe(true);
  });

  it("accepts row without trailing colon", () => {
    const result = parseSIPOC(`row\n  supplier: A`);
    expect(result.ok).toBe(true);
  });

  it("returns error for non-row top-level keyword", () => {
    const result = parseSIPOC("suppliers:\n  Vendor A");
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("expected \"row:\"") });
  });

  it("returns error for cell key before any row:", () => {
    const result = parseSIPOC("  supplier: Orphan");
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("before any") });
  });

  it("returns error for unknown cell key", () => {
    const result = parseSIPOC(`row:\n  widget: X`);
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("unknown cell key") });
  });

  it("returns error for duplicate cell key in same row", () => {
    const result = parseSIPOC(`row:\n  supplier: A\n  supplier: B`);
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("duplicate key") });
  });

  it("returns error for cell line without colon", () => {
    const result = parseSIPOC(`row:\n  just text`);
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("key: value") });
  });

  it("returns error when no rows defined", () => {
    const result = parseSIPOC("// just a comment");
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("No rows") });
  });

  it("parses owner and metric when present", () => {
    const src = `row:\n  supplier: A\n  owner: Alice\n  metric: 99%`;
    const result = parseSIPOC(src);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.rows[0].owner).toBe("Alice");
    expect(result.data.rows[0].metric).toBe("99%");
  });

  it("leaves owner and metric empty when absent", () => {
    const result = parseSIPOC(MINIMAL);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.rows[0].owner).toBe("");
    expect(result.data.rows[0].metric).toBe("");
  });
});
