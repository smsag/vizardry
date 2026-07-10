import { describe, it, expect, vi } from "vitest";
import { reorderSCQAInterior, renameSCQANode, addSCQAChild, deleteSCQANode } from "./scqa-edit";

vi.mock("obsidian", () => ({
  MarkdownView: class MockMarkdownView {
    file: unknown = null;
    editor: unknown = null;
  },
}));

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

// Interior = the lines between the code fences (situation line + descendants).
const base = [
  "situation: S",
  "  Complication one",
  "    Question one",
  "      Answer one",
  "  Complication two",
  "    Question two",
];

describe("reorderSCQAInterior", () => {
  it("moves a complication (with its whole subtree) before an earlier sibling", () => {
    const out = reorderSCQAInterior(base, "Complication two", 0);
    expect(out).toEqual([
      "situation: S",
      "  Complication two",
      "    Question two",
      "  Complication one",
      "    Question one",
      "      Answer one",
    ]);
  });

  it("moves a complication to the end, carrying its subtree", () => {
    const out = reorderSCQAInterior(base, "Complication one", 2);
    expect(out).toEqual([
      "situation: S",
      "  Complication two",
      "    Question two",
      "  Complication one",
      "    Question one",
      "      Answer one",
    ]);
  });

  it("reorders questions within a single complication", () => {
    const lines = [
      "situation: S",
      "  Complication",
      "    Question one",
      "      Answer one",
      "    Question two",
      "      Answer two",
    ];
    const out = reorderSCQAInterior(lines, "Question two", 0);
    expect(out).toEqual([
      "situation: S",
      "  Complication",
      "    Question two",
      "      Answer two",
      "    Question one",
      "      Answer one",
    ]);
  });

  it("returns null for a no-op move (same position)", () => {
    expect(reorderSCQAInterior(base, "Complication one", 0)).toBeNull();
    expect(reorderSCQAInterior(base, "Complication one", 1)).toBeNull();
  });

  it("returns null when the node is not found", () => {
    expect(reorderSCQAInterior(base, "Nonexistent", 0)).toBeNull();
  });

  it("never targets the situation root", () => {
    // "S" is the root; it must not be draggable/found as a reorder target.
    expect(reorderSCQAInterior(base, "S", 0)).toBeNull();
  });

  it("preserves interleaved blank lines outside the moved block", () => {
    const lines = [
      "situation: S",
      "",
      "  Complication one",
      "  Complication two",
    ];
    const out = reorderSCQAInterior(lines, "Complication two", 0);
    expect(out).toEqual([
      "situation: S",
      "",
      "  Complication two",
      "  Complication one",
    ]);
  });
});

describe("renameSCQANode / addSCQAChild / deleteSCQANode", () => {
  it("renames the situation root", () => {
    const editor = makeMockEditor(["situation: Old", "  Complication"]);
    const { app, ctx, el } = fakeCtx(editor);
    expect(renameSCQANode(app, ctx, el, "Old", "New")).toBe(true);
    expect(editor._state[0]).toBe("situation: New");
  });

  it("adds a complication under the situation", () => {
    const editor = makeMockEditor(["situation: S", "```"]);
    const { app, ctx, el } = fakeCtx(editor);
    expect(addSCQAChild(app, ctx, el, "S", "New complication")).toBe(true);
    expect(editor._state).toEqual(["situation: S", "  New complication", "```"]);
  });

  it("refuses to delete the situation root", () => {
    const editor = makeMockEditor(["situation: S", "  Complication"]);
    const { app, ctx, el } = fakeCtx(editor);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(deleteSCQANode(app, ctx, el, "S")).toBe(false);
    warn.mockRestore();
  });

  it("refuses to rename when the same label appears under two different complications", () => {
    const editor = makeMockEditor([
      "situation: S",
      "  Complication A",
      "    Question",
      "  Complication B",
      "    Question",
    ]);
    const { app, ctx, el } = fakeCtx(editor);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = renameSCQANode(app, ctx, el, "Question", "Renamed");
    warn.mockRestore();
    expect(result).toBe(false);
  });
});
