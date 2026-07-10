// @vitest-environment happy-dom
/**
 * Tests for roadmap-edit.ts — surgical source mutations behind the Roadmap
 * canvas (add/rename/move items between and within columns).
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("obsidian", () => ({
  MarkdownView: class MockMarkdownView {
    file: unknown = null;
    editor: unknown = null;
  },
}));

import { addRoadmapItem, renameRoadmapItem, moveRoadmapItem } from "./roadmap-edit";
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
      state.splice(from.line, 1);
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
    workspace: {
      getLeavesOfType: () => [{ view }],
    },
  } as unknown as import("obsidian").App;
  const ctx = {
    sourcePath: "test.md",
    getSectionInfo: () => ({ lineStart: 0, lineEnd: editor.lineCount() - 1 }),
  } as unknown as import("obsidian").MarkdownPostProcessorContext;
  const el = { dataset: {} } as unknown as HTMLElement;
  return { app, ctx, el };
}

describe("moveRoadmapItem", () => {
  it("moves an item forward within the same column", () => {
    const editor = makeMockEditor(["now:", "  item: A", "  item: B", "  item: C", "  item: D"]);
    const { app, ctx, el } = fakeCtx(editor);
    expect(moveRoadmapItem(app, ctx, el, "now", 0, "now", 1)).toBe(true);
    expect(editor._state.map(l => l.trim())).toEqual(["now:", "item: B", "item: A", "item: C", "item: D"]);
  });

  it("moves an item backward within the same column", () => {
    const editor = makeMockEditor(["now:", "  item: A", "  item: B", "  item: C", "  item: D"]);
    const { app, ctx, el } = fakeCtx(editor);
    expect(moveRoadmapItem(app, ctx, el, "now", 2, "now", 0)).toBe(true);
    expect(editor._state.map(l => l.trim())).toEqual(["now:", "item: C", "item: A", "item: B", "item: D"]);
  });

  it("moves an item to the end of the same column", () => {
    const editor = makeMockEditor(["now:", "  item: A", "  item: B", "  item: C", "  item: D"]);
    const { app, ctx, el } = fakeCtx(editor);
    expect(moveRoadmapItem(app, ctx, el, "now", 0, "now", 3)).toBe(true);
    expect(editor._state.map(l => l.trim())).toEqual(["now:", "item: B", "item: C", "item: D", "item: A"]);
  });

  it("moves an item across columns", () => {
    const editor = makeMockEditor(["now:", "  item: A", "  item: B", "next:", "  item: C"]);
    const { app, ctx, el } = fakeCtx(editor);
    expect(moveRoadmapItem(app, ctx, el, "now", 0, "next", 0)).toBe(true);
    expect(editor._state.map(l => l.trim())).toEqual(["now:", "item: B", "next:", "item: A", "item: C"]);
  });

  it("is a no-op when the item stays in the same position", () => {
    const editor = makeMockEditor(["now:", "  item: A", "  item: B"]);
    const { app, ctx, el } = fakeCtx(editor);
    expect(moveRoadmapItem(app, ctx, el, "now", 0, "now", 0)).toBe(true);
    expect(editor._state.map(l => l.trim())).toEqual(["now:", "item: A", "item: B"]);
  });
});

describe("addRoadmapItem / renameRoadmapItem", () => {
  it("adds a new item at the end of the column", () => {
    const editor = makeMockEditor(["now:", "  item: A"]);
    const { app, ctx, el } = fakeCtx(editor);
    expect(addRoadmapItem(app, ctx, el, "now", "B")).toBe(true);
    expect(editor._state.map(l => l.trim())).toEqual(["now:", "item: A", "item: B"]);
  });

  it("renames an existing item, preserving a trailing key suffix", () => {
    const editor = makeMockEditor(["now:", "  item: A | k1"]);
    const { app, ctx, el } = fakeCtx(editor);
    expect(renameRoadmapItem(app, ctx, el, "now", "A", "Renamed")).toBe(true);
    expect(editor._state[1].trim()).toBe("item: Renamed | k1");
  });
});
