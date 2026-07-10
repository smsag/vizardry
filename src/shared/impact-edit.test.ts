// @vitest-environment happy-dom
/**
 * Smoke tests for the impact-edit.ts wrapper around the shared
 * keyword-tree-edit engine (see keyword-tree-edit.test.ts for the thorough
 * behavioral coverage, including the ambiguity-refusal regression tests).
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("obsidian", () => ({
  MarkdownView: class MockMarkdownView {
    file: unknown = null;
    editor: unknown = null;
  },
}));

import { renameImpactNode, addImpactChild, deleteImpactNode } from "./impact-edit";
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

describe("impact-edit.ts (goal/actor/impact/deliverable)", () => {
  it("renames an actor", () => {
    const editor = makeMockEditor(["goal: G", "actor: User"]);
    const { app, ctx, el } = fakeCtx(editor);
    expect(renameImpactNode(app, ctx, el, 1, "User", "Admin")).toBe(true);
    expect(editor._state[1]).toBe("actor: Admin");
  });

  it("adds an impact under an actor", () => {
    const editor = makeMockEditor(["goal: G", "actor: User", "```"]);
    const { app, ctx, el } = fakeCtx(editor);
    expect(addImpactChild(app, ctx, el, 1, "User", "Faster checkout")).toBe(true);
    expect(editor._state).toEqual(["goal: G", "actor: User", "  impact: Faster checkout", "```"]);
  });

  it("deletes a deliverable", () => {
    const editor = makeMockEditor(["goal: G", "actor: A", "  impact: I", "    deliverable: D"]);
    const { app, ctx, el } = fakeCtx(editor);
    expect(deleteImpactNode(app, ctx, el, 3, "D")).toBe(true);
    expect(editor._state).toEqual(["goal: G", "actor: A", "  impact: I"]);
  });

  it("refuses an ambiguous rename across two actors with the same-named impact", () => {
    const editor = makeMockEditor([
      "goal: G",
      "actor: Alpha",
      "  impact: Ship faster",
      "actor: Beta",
      "  impact: Ship faster",
    ]);
    const { app, ctx, el } = fakeCtx(editor);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = renameImpactNode(app, ctx, el, 2, "Ship faster", "Renamed");
    warn.mockRestore();
    expect(result).toBe(false);
  });
});
