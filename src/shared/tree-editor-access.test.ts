// @vitest-environment happy-dom
/**
 * Tests for getEditorAccess — the editor/line-range resolver shared by the tree
 * canvas edit modules (OST, Mind Map, Impact, Fishbone, SCQA tree).
 *
 * The regression these guard: in Live Preview ctx.getSectionInfo() returns null,
 * and getEditorAccess must fall back to locating the block by the container's
 * dataset.vzSource — otherwise tree-node edits silently fail to save.
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("obsidian", () => ({
  MarkdownView: class MockMarkdownView {
    file: unknown = null;
    editor: unknown = null;
  },
}));

import { getEditorAccess } from "./tree-editor-access";
import { MarkdownView } from "obsidian";

function makeMockEditor(lines: string[]) {
  return {
    getLine: (n: number) => lines[n] ?? "",
    lineCount: () => lines.length,
    replaceRange: vi.fn(),
  };
}

function makeApp(sourcePath: string, editor: ReturnType<typeof makeMockEditor> | null) {
  const view = Object.create((MarkdownView as any).prototype) as any;
  view.file = { path: sourcePath };
  view.editor = editor;
  return {
    vault: { getFileByPath: (p: string) => (p === sourcePath ? { path: p } : null) },
    workspace: { getLeavesOfType: () => (editor ? [{ view }] : []) },
  };
}

const withInfo = (sourcePath: string, lineStart: number, lineEnd: number) => ({
  sourcePath,
  getSectionInfo: () => ({ lineStart, lineEnd, text: "" }),
});
const noInfo = (sourcePath: string) => ({ sourcePath, getSectionInfo: () => null });

describe("getEditorAccess", () => {
  it("resolves the line range from getSectionInfo when available (Reading View)", () => {
    const editor = makeMockEditor(["```ost", "outcome: X", "```"]);
    const app = makeApp("note.md", editor) as any;
    const el = document.createElement("div");
    const res = getEditorAccess(app, withInfo("note.md", 0, 2) as any, el, "test");
    expect(res).toEqual({ editor, lineStart: 0, lineEnd: 2 });
  });

  it("falls back to the vzSource scan when getSectionInfo is null (Live Preview)", () => {
    const editor = makeMockEditor(["```ost", "outcome: X", "  Opportunity", "```"]);
    const app = makeApp("note.md", editor) as any;
    const el = document.createElement("div");
    el.dataset.vzSource = "outcome: X\n  Opportunity";
    const res = getEditorAccess(app, noInfo("note.md") as any, el, "test");
    expect(res).toEqual({ editor, lineStart: 0, lineEnd: 3 });
  });

  it("returns null when getSectionInfo is null and no vzSource is set", () => {
    const editor = makeMockEditor([]);
    const app = makeApp("note.md", editor) as any;
    const el = document.createElement("div");
    expect(getEditorAccess(app, noInfo("note.md") as any, el, "test")).toBeNull();
  });
});
