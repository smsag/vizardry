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

  // ── variant (typeOverride) ──────────────────────────────────────────────

  it("defaults to the table variant when no typeOverride is given", () => {
    const result = parseSIPOC(MINIMAL);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.variant).toBe("table");
  });

  it("sets the variant from typeOverride", () => {
    const result = parseSIPOC(MINIMAL, "flow");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.variant).toBe("flow");
  });

  it("rejects an unknown typeOverride", () => {
    const result = parseSIPOC(MINIMAL, "chart");
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("chart") });
  });

  // ── link: parsing ────────────────────────────────────────────────────────
  //
  // Only syntax is checked here (well-formed "A -> B") — whether from/to
  // actually match a row's cell text is a flow-view rendering concern (see
  // renderer/sipoc.test.ts), never a parse error. This is what lets a stale
  // link sit inert through table view instead of breaking it.

  it("parses link: lines regardless of variant", () => {
    const src = `${MINIMAL}\n\nlink: Vendor A -> Raw material`;
    const result = parseSIPOC(src);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.links).toEqual([{ from: "Vendor A", to: "Raw material" }]);
  });

  it("parses multiple link: lines", () => {
    const src = `${MINIMAL}\n\nlink: A -> B\nlink: B -> C`;
    const result = parseSIPOC(src);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.links).toHaveLength(2);
  });

  it("does not validate link targets against row cells at parse time", () => {
    // "Ghost" matches no cell anywhere — parsing still succeeds because
    // target resolution only happens when flow view actually renders.
    const src = `${MINIMAL}\n\nlink: Ghost -> AlsoGhost`;
    const result = parseSIPOC(src);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.links).toEqual([{ from: "Ghost", to: "AlsoGhost" }]);
  });

  it("a row edit that orphans a link still parses fine", () => {
    // Simulates renaming "Vendor A" to something else while a link: line
    // still says "Vendor A" — table-level parsing must not care.
    const src = `row:\n  supplier: Renamed Vendor\n\nlink: Vendor A -> Raw material`;
    const result = parseSIPOC(src);
    expect(result.ok).toBe(true);
  });

  it("returns error for link missing the -> separator", () => {
    const result = parseSIPOC(`${MINIMAL}\n\nlink: A to B`);
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("->") });
  });

  it("returns error for link missing a node name", () => {
    const result = parseSIPOC(`${MINIMAL}\n\nlink: A ->`);
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("two node names") });
  });

  it("accepts link: case-insensitively", () => {
    const result = parseSIPOC(`${MINIMAL}\n\nLINK: A -> B`);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.links).toEqual([{ from: "A", to: "B" }]);
  });
});
