// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";

vi.mock("obsidian", () => ({
  MarkdownView: class MockMarkdownView {
    file: unknown = null;
    editor: unknown = null;
  },
}));

import { renameKeywordTreeNode, addKeywordTreeChild, deleteKeywordTreeNode } from "./keyword-tree-edit";
import type { KeywordTreeConfig } from "./keyword-tree-edit";
import { MarkdownView } from "obsidian";

const CONFIG: KeywordTreeConfig = {
  levelKeyword: { 0: "effect", 1: "category", 2: "cause", 3: "subcause" },
};

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

describe("renameKeywordTreeNode", () => {
  it("renames the single matching node, preserving indent", () => {
    const editor = makeMockEditor([
      "effect: Cart abandonment",
      "category: Tech",
      "  cause: API latency",
    ]);
    const { app, ctx, el } = fakeCtx(editor);
    expect(renameKeywordTreeNode(app, ctx, el, CONFIG, 2, "API latency", "Slow API")).toBe(true);
    expect(editor._state[2]).toBe("  cause: Slow API");
  });

  it("returns false and does not edit anything when the node is not found", () => {
    const editor = makeMockEditor(["effect: E", "category: C"]);
    const { app, ctx, el } = fakeCtx(editor);
    expect(renameKeywordTreeNode(app, ctx, el, CONFIG, 1, "Nonexistent", "New")).toBe(false);
    expect(editor._state).toEqual(["effect: E", "category: C"]);
  });

  it("refuses to rename when two different parents each have a same-named child, instead of silently picking one", () => {
    // The concrete data-loss scenario: two categories each with a
    // "cause: Fix bug" child. A flat text scan can't tell them apart.
    const editor = makeMockEditor([
      "effect: E",
      "category: Backend",
      "  cause: Fix bug",
      "category: Frontend",
      "  cause: Fix bug",
    ]);
    const { app, ctx, el } = fakeCtx(editor);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = renameKeywordTreeNode(app, ctx, el, CONFIG, 2, "Fix bug", "Fix bug (renamed)");
    warn.mockRestore();

    expect(result).toBe(false);
    // Neither occurrence was touched.
    expect(editor._state).toEqual([
      "effect: E",
      "category: Backend",
      "  cause: Fix bug",
      "category: Frontend",
      "  cause: Fix bug",
    ]);
  });
});

describe("addKeywordTreeChild", () => {
  it("adds a category under the effect root (level 0 -> level 1, root-indent special case)", () => {
    const editor = makeMockEditor([
      "effect: E",
      "category: Tech",
      "  cause: Slow queries",
      "```",
    ]);
    const { app, ctx, el } = fakeCtx(editor);
    expect(addKeywordTreeChild(app, ctx, el, CONFIG, 0, "E", "Process")).toBe(true);
    expect(editor._state).toEqual([
      "effect: E",
      "category: Tech",
      "  cause: Slow queries",
      "category: Process",
      "```",
    ]);
  });

  it("adds a cause under the correct category when the same cause text exists under a different category", () => {
    const editor = makeMockEditor([
      "effect: E",
      "category: Backend",
      "  cause: Existing",
      "category: Frontend",
      "```",
    ]);
    const { app, ctx, el } = fakeCtx(editor);
    expect(addKeywordTreeChild(app, ctx, el, CONFIG, 1, "Frontend", "New cause")).toBe(true);
    expect(editor._state).toEqual([
      "effect: E",
      "category: Backend",
      "  cause: Existing",
      "category: Frontend",
      "  cause: New cause",
      "```",
    ]);
  });

  it("deduplicates a new child's text against every existing node label", () => {
    const editor = makeMockEditor([
      "effect: E",
      "category: Tech",
      "  cause: Slow queries",
    ]);
    const { app, ctx, el } = fakeCtx(editor);
    addKeywordTreeChild(app, ctx, el, CONFIG, 1, "Tech", "Slow queries");
    expect(editor._state[3]).toBe("  cause: Slow queries 2");
  });

  it("refuses to add a child to the deepest level (subcause has no child keyword)", () => {
    const editor = makeMockEditor([
      "effect: E",
      "category: C",
      "  cause: X",
      "    subcause: Y",
    ]);
    const { app, ctx, el } = fakeCtx(editor);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(addKeywordTreeChild(app, ctx, el, CONFIG, 3, "Y", "Z")).toBe(false);
    warn.mockRestore();
  });

  it("refuses to add a child under an ambiguous parent", () => {
    const editor = makeMockEditor([
      "effect: E",
      "category: Dup",
      "  cause: A",
      "category: Dup",
    ]);
    const { app, ctx, el } = fakeCtx(editor);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = addKeywordTreeChild(app, ctx, el, CONFIG, 1, "Dup", "New");
    warn.mockRestore();
    expect(result).toBe(false);
  });
});

describe("deleteKeywordTreeNode", () => {
  it("deletes a node and its entire subtree", () => {
    const editor = makeMockEditor([
      "effect: E",
      "category: Tech",
      "  cause: A",
      "    subcause: A1",
      "  cause: B",
      "category: Process",
    ]);
    const { app, ctx, el } = fakeCtx(editor);
    expect(deleteKeywordTreeNode(app, ctx, el, CONFIG, 2, "A")).toBe(true);
    expect(editor._state).toEqual([
      "effect: E",
      "category: Tech",
      "  cause: B",
      "category: Process",
    ]);
  });

  it("refuses to delete the root (level 0)", () => {
    const editor = makeMockEditor(["effect: E", "category: C"]);
    const { app, ctx, el } = fakeCtx(editor);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(deleteKeywordTreeNode(app, ctx, el, CONFIG, 0, "E")).toBe(false);
    warn.mockRestore();
    expect(editor._state).toEqual(["effect: E", "category: C"]);
  });

  it("refuses to delete an ambiguous node, leaving both copies intact", () => {
    const editor = makeMockEditor([
      "effect: E",
      "category: Backend",
      "  cause: Fix bug",
      "category: Frontend",
      "  cause: Fix bug",
    ]);
    const { app, ctx, el } = fakeCtx(editor);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = deleteKeywordTreeNode(app, ctx, el, CONFIG, 2, "Fix bug");
    warn.mockRestore();
    expect(result).toBe(false);
    expect(editor._state).toHaveLength(5);
  });
});
