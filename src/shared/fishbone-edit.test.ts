// @vitest-environment happy-dom
/**
 * Smoke tests for the fishbone-edit.ts wrapper around the shared
 * keyword-tree-edit engine (see keyword-tree-edit.test.ts, which uses this
 * exact keyword scheme, for the thorough behavioral coverage including the
 * ambiguity-refusal regression tests).
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("obsidian", () => ({
  MarkdownView: class MockMarkdownView {
    file: unknown = null;
    editor: unknown = null;
  },
}));

import { renameFishboneNode, addFishboneChild, deleteFishboneNode } from "./fishbone-edit";
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

describe("fishbone-edit.ts (effect/category/cause/subcause)", () => {
  it("renames a cause", () => {
    const editor = makeMockEditor(["effect: E", "category: Tech", "  cause: Slow"]);
    const { app, ctx, el } = fakeCtx(editor);
    expect(renameFishboneNode(app, ctx, el, 2, "Slow", "Latency")).toBe(true);
    expect(editor._state[2]).toBe("  cause: Latency");
  });

  it("adds a subcause under a cause", () => {
    const editor = makeMockEditor(["effect: E", "category: Tech", "  cause: Slow", "```"]);
    const { app, ctx, el } = fakeCtx(editor);
    expect(addFishboneChild(app, ctx, el, 2, "Slow", "N+1 queries")).toBe(true);
    expect(editor._state).toEqual(["effect: E", "category: Tech", "  cause: Slow", "    subcause: N+1 queries", "```"]);
  });

  it("refuses to delete the effect root", () => {
    const editor = makeMockEditor(["effect: E", "category: C"]);
    const { app, ctx, el } = fakeCtx(editor);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(deleteFishboneNode(app, ctx, el, 0, "E")).toBe(false);
    warn.mockRestore();
  });
});
