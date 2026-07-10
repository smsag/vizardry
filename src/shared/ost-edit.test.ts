// @vitest-environment happy-dom
/**
 * Smoke tests for the ost-edit.ts wrapper around the shared
 * rootkw-tree-edit engine (see rootkw-tree-edit.test.ts for the thorough
 * behavioral coverage, including the maxDepth=4 regression test).
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("obsidian", () => ({
  MarkdownView: class MockMarkdownView {
    file: unknown = null;
    editor: unknown = null;
  },
}));

import { renameOSTNode, addOSTChild, deleteOSTNode } from "./ost-edit";
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

describe("ost-edit.ts", () => {
  it("renames the outcome root", () => {
    const editor = makeMockEditor(["outcome: Old", "  Opportunity"]);
    const { app, ctx, el } = fakeCtx(editor);
    expect(renameOSTNode(app, ctx, el, "Old", "New")).toBe(true);
    expect(editor._state[0]).toBe("outcome: New");
  });

  it("adds an opportunity under the outcome", () => {
    const editor = makeMockEditor(["outcome: O", "```"]);
    const { app, ctx, el } = fakeCtx(editor);
    expect(addOSTChild(app, ctx, el, "O", "New opportunity")).toBe(true);
    expect(editor._state).toEqual(["outcome: O", "  New opportunity", "```"]);
  });

  it("refuses to delete the outcome root", () => {
    const editor = makeMockEditor(["outcome: O", "  Opportunity"]);
    const { app, ctx, el } = fakeCtx(editor);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(deleteOSTNode(app, ctx, el, "O")).toBe(false);
    warn.mockRestore();
  });
});
