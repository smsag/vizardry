import { describe, it, expect } from "vitest";
import { buildIndentTree, detectIndentUnit, extractMeaningfulLines } from "./indent-tree";

interface Node { text: string; children: Node[] }
const make = (text: string): Node => ({ text, children: [] });

describe("extractMeaningfulLines", () => {
  it("strips blank lines and comments", () => {
    const result = extractMeaningfulLines("// comment\n\nroot\n  child");
    expect(result).toEqual([
      { indent: 0, text: "root", lineNum: 3 },
      { indent: 2, text: "child", lineNum: 4 },
    ]);
  });

  it("returns empty array for blank source", () => {
    expect(extractMeaningfulLines("")).toEqual([]);
  });
});

describe("detectIndentUnit", () => {
  it("returns the first non-zero indent found", () => {
    const lines = [
      { indent: 0, text: "root", lineNum: 1 },
      { indent: 4, text: "child", lineNum: 2 },
    ];
    expect(detectIndentUnit(lines)).toBe(4);
  });

  it("returns 0 when no indented lines exist", () => {
    const lines = [{ indent: 0, text: "root", lineNum: 1 }];
    expect(detectIndentUnit(lines)).toBe(0);
  });
});

describe("buildIndentTree", () => {
  it("builds a single-node tree", () => {
    const lines = [{ indent: 0, text: "root", lineNum: 1 }];
    const result = buildIndentTree(lines, 0, make);
    expect(result).toEqual({ ok: true, root: { text: "root", children: [] } });
  });

  it("builds a two-level tree", () => {
    const lines = [
      { indent: 0, text: "root", lineNum: 1 },
      { indent: 2, text: "child", lineNum: 2 },
    ];
    const result = buildIndentTree(lines, 2, make);
    expect(result).toEqual({
      ok: true,
      root: { text: "root", children: [{ text: "child", children: [] }] },
    });
  });

  it("builds siblings correctly", () => {
    const lines = [
      { indent: 0, text: "root", lineNum: 1 },
      { indent: 2, text: "a", lineNum: 2 },
      { indent: 2, text: "b", lineNum: 3 },
    ];
    const result = buildIndentTree(lines, 2, make);
    expect(result.ok && result.root.children.map(c => c.text)).toEqual(["a", "b"]);
  });

  it("builds a three-level tree", () => {
    const lines = [
      { indent: 0, text: "root", lineNum: 1 },
      { indent: 2, text: "parent", lineNum: 2 },
      { indent: 4, text: "leaf", lineNum: 3 },
    ];
    const result = buildIndentTree(lines, 2, make);
    expect(result.ok && result.root.children[0].children[0].text).toBe("leaf");
  });

  it("enforces maxDepth", () => {
    const lines = [
      { indent: 0, text: "root", lineNum: 1 },
      { indent: 2, text: "depth1", lineNum: 2 },
      { indent: 4, text: "depth2", lineNum: 3 },
    ];
    const result = buildIndentTree(lines, 2, make, 1);
    expect(result).toEqual({ ok: false, error: expect.stringContaining("maximum nesting depth") });
  });

  it("rejects non-multiple indentation", () => {
    const lines = [
      { indent: 0, text: "root", lineNum: 1 },
      { indent: 3, text: "child", lineNum: 2 },
    ];
    const result = buildIndentTree(lines, 2, make);
    expect(result).toEqual({ ok: false, error: expect.stringContaining("not a multiple") });
  });
});
