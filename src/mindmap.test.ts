import { describe, it, expect } from "vitest";
import { parseMindMap } from "./mindmap";

describe("parseMindMap", () => {
  it("parses a minimal single-node map", () => {
    const result = parseMindMap("root: Central Topic");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.root.text).toBe("Central Topic");
    expect(result.data.root.children).toHaveLength(0);
  });

  it("parses branches at level 1", () => {
    const src = "root: Topic\n\n  Branch A\n  Branch B";
    const result = parseMindMap(src);
    expect(result.ok && result.data.root.children.map(c => c.text)).toEqual(["Branch A", "Branch B"]);
  });

  it("parses deeply nested nodes", () => {
    const src = "root: Topic\n  Branch\n    Sub-item\n      Deep item";
    const result = parseMindMap(src);
    expect(result.ok && result.data.root.children[0].children[0].children[0].text).toBe("Deep item");
  });

  it("ignores comment lines", () => {
    const src = "# comment\nroot: Topic\n  # nested comment\n  Branch";
    const result = parseMindMap(src);
    expect(result.ok && result.data.root.children).toHaveLength(1);
  });

  it("returns error for empty source", () => {
    const result = parseMindMap("");
    expect(result).toEqual({ ok: false, error: expect.stringContaining('"root:"') });
  });

  it("returns error when first line is not root:", () => {
    const result = parseMindMap("branch: Something");
    expect(result).toEqual({ ok: false, error: expect.stringContaining("first line must be") });
  });

  it("returns error for duplicate root:", () => {
    const src = "root: A\nroot: B";
    const result = parseMindMap(src);
    expect(result).toEqual({ ok: false, error: expect.stringContaining("duplicate") });
  });

  it("returns error for root: with no label", () => {
    const result = parseMindMap("root:");
    expect(result).toEqual({ ok: false, error: expect.stringContaining("non-empty label") });
  });

  it("returns error for inconsistent indentation", () => {
    const src = "root: Topic\n  Branch\n   Bad indent";
    const result = parseMindMap(src);
    expect(result).toEqual({ ok: false, error: expect.stringContaining("multiple") });
  });
});
