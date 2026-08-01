// @vitest-environment happy-dom
/**
 * Tests for matrix `item:` write-back: writeItemPosition (drag → [x,y]) and
 * writeItemContent (edit → body). Uses the same minimal Obsidian fakes as
 * block-edit.test.ts.
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("obsidian", () => ({
  MarkdownView: class MockMarkdownView {
    file: unknown = null;
    editor: unknown = null;
  },
}));

import { writeItemPosition, writeItemContent } from "./matrix-edit";
import { MarkdownView } from "obsidian";

function makeMockEditor(lines: string[]) {
  const replaceRange = vi.fn();
  return { getLine: (n: number) => lines[n] ?? "", lineCount: () => lines.length, replaceRange };
}
type MockEditor = ReturnType<typeof makeMockEditor>;

function makeApp(sourcePath: string, editor: MockEditor | null) {
  const view = Object.create((MarkdownView as any).prototype) as any;
  view.file = { path: sourcePath };
  view.editor = editor;
  return {
    vault: { getFileByPath: (p: string) => (p === sourcePath ? { path: p } : null) },
    workspace: { getLeavesOfType: () => (editor ? [{ view }] : []) },
  };
}

function makeCtx(sourcePath: string, lineStart: number, lineEnd: number) {
  return { sourcePath, getSectionInfo: () => ({ lineStart, lineEnd, text: "" }) };
}

const FENCE = [
  "```vizardry",                          // 0
  "type: matrix, impact",                 // 1
  "item: Fix checkout [0.2, 0.8]",        // 2
  "  Wallet rejected",                    // 3
  "item: Dark mode at: t7",               // 4
  "```",                                  // 5
];

describe("writeItemPosition", () => {
  it("rewrites a coordinate item's header, preserving the label", () => {
    const editor = makeMockEditor([...FENCE]);
    const app = makeApp("note.md", editor) as any;
    const ok = writeItemPosition(app, makeCtx("note.md", 0, 5) as any, document.createElement("div"), "Fix checkout", 0.5, 0.6);
    expect(ok).toBe(true);
    expect(editor.replaceRange).toHaveBeenCalledWith(
      "item: Fix checkout [0.5, 0.6]",
      { line: 2, ch: 0 },
      { line: 2, ch: FENCE[2].length },
    );
  });

  it("converts an `at:` item to coordinates on drag, rounding to 2 dp", () => {
    const editor = makeMockEditor([...FENCE]);
    const app = makeApp("note.md", editor) as any;
    writeItemPosition(app, makeCtx("note.md", 0, 5) as any, document.createElement("div"), "Dark mode", 0.126, 0.874);
    expect(editor.replaceRange).toHaveBeenCalledWith(
      "item: Dark mode [0.13, 0.87]",
      { line: 4, ch: 0 },
      { line: 4, ch: FENCE[4].length },
    );
  });

  it("returns false when the item is not found", () => {
    const editor = makeMockEditor([...FENCE]);
    const app = makeApp("note.md", editor) as any;
    expect(writeItemPosition(app, makeCtx("note.md", 0, 5) as any, document.createElement("div"), "Ghost", 0.5, 0.5)).toBe(false);
    expect(editor.replaceRange).not.toHaveBeenCalled();
  });
});

describe("writeItemContent", () => {
  it("replaces an existing indented body", () => {
    const editor = makeMockEditor([...FENCE]);
    const app = makeApp("note.md", editor) as any;
    writeItemContent(app, makeCtx("note.md", 0, 5) as any, document.createElement("div"), "Fix checkout", "New detail");
    expect(editor.replaceRange).toHaveBeenCalledWith(
      "  New detail",
      { line: 3, ch: 0 },
      { line: 3, ch: FENCE[3].length },
    );
  });

  it("inserts a body after the header when the item had none", () => {
    const editor = makeMockEditor([...FENCE]);
    const app = makeApp("note.md", editor) as any;
    writeItemContent(app, makeCtx("note.md", 0, 5) as any, document.createElement("div"), "Dark mode", "Now detailed");
    expect(editor.replaceRange).toHaveBeenCalledWith(
      "\n  Now detailed",
      { line: 4, ch: FENCE[4].length },
    );
  });
});
