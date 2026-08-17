// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";

vi.mock("obsidian", () => ({
  MarkdownView: class MockMarkdownView {
    file: unknown = null;
    editor: unknown = null;
  },
}));

import { detectIndentUnit, subtreeEnd } from "./tree-editor-access";

function makeMockEditor(lines: string[]) {
  return {
    getLine: (n: number) => lines[n] ?? "",
    lineCount: () => lines.length,
    replaceRange: vi.fn(),
  };
}

describe("detectIndentUnit", () => {
  it("returns the leading spaces of the first indented line", () => {
    const editor = makeMockEditor(["root: X", "    Branch", "  Leaf"]);
    expect(detectIndentUnit(editor as any, 0, 2)).toBe(4);
  });

  it("defaults to 2 when no indented line exists", () => {
    const editor = makeMockEditor(["root: X"]);
    expect(detectIndentUnit(editor as any, 0, 0)).toBe(2);
  });
});

describe("subtreeEnd", () => {
  it("returns the last line of a subtree", () => {
    const editor = makeMockEditor(["root: X", "  Branch", "    Leaf", "  Other"]);
    expect(subtreeEnd(editor as any, 1, 2, 3)).toBe(2);
  });

  it("includes trailing blank lines in the subtree", () => {
    const editor = makeMockEditor(["root: X", "  Branch", "    Leaf", "", "  Other"]);
    expect(subtreeEnd(editor as any, 1, 2, 4)).toBe(3);
  });
});
