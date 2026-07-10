// @vitest-environment happy-dom
/**
 * Smoke tests for the mindmap-edit.ts wrapper around the shared
 * rootkw-tree-edit engine (see rootkw-tree-edit.test.ts for the thorough
 * behavioral coverage, including the ambiguity-refusal and dedup regression
 * tests — mindmap previously had NO dedup at all).
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("obsidian", () => ({
  MarkdownView: class MockMarkdownView {
    file: unknown = null;
    editor: unknown = null;
  },
}));

import { renameMindMapNode, addMindMapChild, deleteMindMapNode } from "./mindmap-edit";
import { MarkdownView } from "obsidian";

function makeMockEditor(lines: string[]) {
  const state = [...lines];
  const replaceRange = vi.fn((text: string, from: { line: number; ch: number }, to?: { line: number; ch: number }) => {
    if (to === undefined) {
      const line = state[from.line] ?? "";
      const head = line.slice(0, from.ch);
      const tail = line.slice(from.ch);
      const parts = text.split("\n");
      const newLines = parts.map((p, i) => (i === 0 ? head + p : i === parts.length - 1 ? p + tail : p));
      state.splice(from.line, 1, ...newLines);
    } else if (text === "" && to.ch === 0) {
      state.splice(from.line, to.line - from.line);
    } else {
      const line = state[from.line] ?? "";
      state[from.line] = line.slice(0, from.ch) + text + line.slice(to.ch);
    }
  });
  return { getLine: (n: number) => state[n] ?? "", lineCount: () => state.length, replaceRange, _state: state };
}

function fakeCtx(editor: ReturnType<typeof makeMockEditor>) {
  const view = new (MarkdownView as unknown as new () => { file: unknown; editor: unknown })();
  view.file = { path: "test.md" };
  view.editor = editor;
  const app = {
    vault: { getFileByPath: (p: string) => (p === "test.md" ? { path: p } : null) },
    workspace: { getLeavesOfType: () => [{ view }] },
  } as unknown as import("obsidian").App;
  const ctx = {
    sourcePath: "test.md",
    getSectionInfo: () => ({ lineStart: 0, lineEnd: editor.lineCount() - 1 }),
  } as unknown as import("obsidian").MarkdownPostProcessorContext;
  const el = { dataset: {}, closest: () => null } as unknown as HTMLElement;
  return { app, ctx, el };
}

describe("mindmap-edit.ts", () => {
  it("renames a node", () => {
    const editor = makeMockEditor(["root: R", "  Branch"]);
    const { app, ctx, el } = fakeCtx(editor);
    expect(renameMindMapNode(app, ctx, el, "Branch", "Renamed")).toBe(true);
    expect(editor._state[1]).toBe("  Renamed");
  });

  it("adds a child and deduplicates its label", () => {
    const editor = makeMockEditor(["root: R", "  Branch", "```"]);
    const { app, ctx, el } = fakeCtx(editor);
    expect(addMindMapChild(app, ctx, el, "R", "Branch")).toBe(true);
    expect(editor._state).toEqual(["root: R", "  Branch", "  Branch 2", "```"]);
  });

  it("deletes a node and refuses to delete the root", () => {
    const editor = makeMockEditor(["root: R", "  Branch"]);
    const { app, ctx, el } = fakeCtx(editor);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(deleteMindMapNode(app, ctx, el, "R")).toBe(false);
    expect(deleteMindMapNode(app, ctx, el, "Branch")).toBe(true);
    warn.mockRestore();
    expect(editor._state).toEqual(["root: R"]);
  });
});
