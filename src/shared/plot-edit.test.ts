// @vitest-environment happy-dom
/**
 * Tests for the plot-mode write-back: writeItemPosition (drag → x/y) and
 * writeItemContent (edit → body). Uses the same minimal Obsidian fakes as
 * block-edit.test.ts so the surgical editor patches can be verified without
 * Obsidian's runtime.
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("obsidian", () => ({
  MarkdownView: class MockMarkdownView {
    file: unknown = null;
    editor: unknown = null;
  },
}));

import { writeItemPosition, writeItemContent } from "./plot-edit";
import { MarkdownView } from "obsidian";

function makeMockEditor(lines: string[]) {
  const replaceRange = vi.fn();
  return {
    getLine: (n: number) => lines[n] ?? "",
    lineCount: () => lines.length,
    replaceRange,
  };
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
  "```vizardry",                       // 0
  "type: matrix, impact",              // 1
  "layout: plot",                      // 2
  "x-axis: Effort | Low | High",       // 3
  "y-axis: Impact | Low | High",       // 4
  "item: Fix checkout | x: 0.2, y: 0.8", // 5
  "  Wallet rejected",                 // 6
  "item: Dark mode | x: 0.3, y: 0.25", // 7
  "```",                               // 8
];

describe("writeItemPosition", () => {
  it("rewrites the header's coordinates, preserving the label text", () => {
    const editor = makeMockEditor([...FENCE]);
    const app = makeApp("note.md", editor) as any;
    const ok = writeItemPosition(app, makeCtx("note.md", 0, 8) as any, document.createElement("div"), "Fix checkout", 0.5, 0.6);
    expect(ok).toBe(true);
    expect(editor.replaceRange).toHaveBeenCalledWith(
      "item: Fix checkout | x: 0.5, y: 0.6",
      { line: 5, ch: 0 },
      { line: 5, ch: FENCE[5].length },
    );
  });

  it("rounds coordinates to two decimals to limit diff churn", () => {
    const editor = makeMockEditor([...FENCE]);
    const app = makeApp("note.md", editor) as any;
    writeItemPosition(app, makeCtx("note.md", 0, 8) as any, document.createElement("div"), "Dark mode", 0.126, 0.874);
    expect(editor.replaceRange).toHaveBeenCalledWith(
      "item: Dark mode | x: 0.13, y: 0.87",
      { line: 7, ch: 0 },
      { line: 7, ch: FENCE[7].length },
    );
  });

  it("returns false when the item is not found", () => {
    const editor = makeMockEditor([...FENCE]);
    const app = makeApp("note.md", editor) as any;
    const ok = writeItemPosition(app, makeCtx("note.md", 0, 8) as any, document.createElement("div"), "Ghost", 0.5, 0.5);
    expect(ok).toBe(false);
    expect(editor.replaceRange).not.toHaveBeenCalled();
  });
});

describe("writeItemContent", () => {
  it("replaces an existing indented body", () => {
    const editor = makeMockEditor([...FENCE]);
    const app = makeApp("note.md", editor) as any;
    const ok = writeItemContent(app, makeCtx("note.md", 0, 8) as any, document.createElement("div"), "Fix checkout", "New detail");
    expect(ok).toBe(true);
    expect(editor.replaceRange).toHaveBeenCalledWith(
      "  New detail",
      { line: 6, ch: 0 },
      { line: 6, ch: FENCE[6].length },
    );
  });

  it("inserts a body after the header when the item had none", () => {
    const editor = makeMockEditor([...FENCE]);
    const app = makeApp("note.md", editor) as any;
    const ok = writeItemContent(app, makeCtx("note.md", 0, 8) as any, document.createElement("div"), "Dark mode", "Now has detail");
    expect(ok).toBe(true);
    expect(editor.replaceRange).toHaveBeenCalledWith(
      "\n  Now has detail",
      { line: 7, ch: FENCE[7].length },
    );
  });
});
