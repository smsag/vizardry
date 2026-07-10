// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";

vi.mock("obsidian", () => ({
  MarkdownView: class MockMarkdownView {
    file: unknown = null;
    editor: unknown = null;
  },
}));

import { renameRootKwTreeNode, addRootKwTreeChild, deleteRootKwTreeNode } from "./rootkw-tree-edit";
import type { RootKwTreeConfig } from "./rootkw-tree-edit";
import { MarkdownView } from "obsidian";

const MINDMAP_CONFIG: RootKwTreeConfig = { rootKeyword: "root" };
const OST_CONFIG: RootKwTreeConfig = { rootKeyword: "outcome", maxDepth: 4 };

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
  return {
    getLine: (n: number) => state[n] ?? "",
    lineCount: () => state.length,
    replaceRange,
    _state: state,
  };
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

describe("renameRootKwTreeNode", () => {
  it("renames the root line, preserving the keyword prefix", () => {
    const editor = makeMockEditor(["root: Old", "  Child"]);
    const { app, ctx, el } = fakeCtx(editor);
    expect(renameRootKwTreeNode(app, ctx, el, MINDMAP_CONFIG, "Old", "New")).toBe(true);
    expect(editor._state[0]).toBe("root: New");
  });

  it("renames a plain non-root node", () => {
    const editor = makeMockEditor(["root: R", "  Branch"]);
    const { app, ctx, el } = fakeCtx(editor);
    expect(renameRootKwTreeNode(app, ctx, el, MINDMAP_CONFIG, "Branch", "Renamed")).toBe(true);
    expect(editor._state[1]).toBe("  Renamed");
  });

  it("refuses to rename when the same label appears twice under different branches", () => {
    const editor = makeMockEditor([
      "root: R",
      "  Branch A",
      "    Leaf",
      "  Branch B",
      "    Leaf",
    ]);
    const { app, ctx, el } = fakeCtx(editor);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = renameRootKwTreeNode(app, ctx, el, MINDMAP_CONFIG, "Leaf", "Renamed");
    warn.mockRestore();
    expect(result).toBe(false);
    expect(editor._state.filter(l => l.trim() === "Leaf")).toHaveLength(2);
  });
});

describe("addRootKwTreeChild", () => {
  it("adds a child under the root", () => {
    const editor = makeMockEditor(["root: R", "```"]);
    const { app, ctx, el } = fakeCtx(editor);
    expect(addRootKwTreeChild(app, ctx, el, MINDMAP_CONFIG, "R", "First branch")).toBe(true);
    expect(editor._state).toEqual(["root: R", "  First branch", "```"]);
  });

  it("deduplicates a new child's text against existing labels (mindmap previously had NO dedup at all)", () => {
    const editor = makeMockEditor(["root: R", "  Branch", "```"]);
    const { app, ctx, el } = fakeCtx(editor);
    addRootKwTreeChild(app, ctx, el, MINDMAP_CONFIG, "R", "Branch");
    expect(editor._state).toEqual(["root: R", "  Branch", "  Branch 2", "```"]);
  });

  it("enforces maxDepth for OST (outcome/opportunity/solution/experiment/assumption = 4 levels deep)", () => {
    const editor = makeMockEditor([
      "outcome: O",
      "  Opportunity",
      "    Solution",
      "      Experiment",
      "        Assumption",
    ]);
    const { app, ctx, el } = fakeCtx(editor);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = addRootKwTreeChild(app, ctx, el, OST_CONFIG, "Assumption", "Too deep");
    warn.mockRestore();
    expect(result).toBe(false);
  });

  it("does not enforce a depth limit when maxDepth is omitted (Mind Map)", () => {
    const editor = makeMockEditor([
      "root: R",
      "  A",
      "    B",
      "      C",
      "        D",
    ]);
    const { app, ctx, el } = fakeCtx(editor);
    expect(addRootKwTreeChild(app, ctx, el, MINDMAP_CONFIG, "D", "E")).toBe(true);
  });
});

describe("deleteRootKwTreeNode", () => {
  it("deletes a node and its subtree", () => {
    const editor = makeMockEditor(["root: R", "  A", "    A1", "  B"]);
    const { app, ctx, el } = fakeCtx(editor);
    expect(deleteRootKwTreeNode(app, ctx, el, MINDMAP_CONFIG, "A")).toBe(true);
    expect(editor._state).toEqual(["root: R", "  B"]);
  });

  it("refuses to delete the root", () => {
    const editor = makeMockEditor(["root: R", "  A"]);
    const { app, ctx, el } = fakeCtx(editor);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(deleteRootKwTreeNode(app, ctx, el, MINDMAP_CONFIG, "R")).toBe(false);
    warn.mockRestore();
    expect(editor._state).toEqual(["root: R", "  A"]);
  });
});
