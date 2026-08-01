// @vitest-environment happy-dom
/**
 * Smoke tests for the ost-edit.ts wrapper around the shared keyword-tree
 * engine (see keyword-tree-edit.test.ts for thorough behavioral coverage).
 * OST is strict-nesting: every level indents one unit under its parent and
 * carries its own keyword (outcome/need·pain·desire/solution/experiment).
 * Each node's own keyword is passed through so need/pain/desire can be told
 * apart, and bare indented lines are edited as bullets.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("obsidian", () => ({
  MarkdownView: class MockMarkdownView {
    file: unknown = null;
    editor: unknown = null;
  },
}));

import { renameOSTNode, addOSTChild, deleteOSTNode, addOSTBullet, editOSTBullet, deleteOSTBullet } from "./ost-edit";
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
    const editor = makeMockEditor(["outcome: Old", "  need: Opp"]);
    const { app, ctx, el } = fakeCtx(editor);
    expect(renameOSTNode(app, ctx, el, "outcome", 0, "Old", "New")).toBe(true);
    expect(editor._state[0]).toBe("outcome: New");
  });

  it("renames a nested solution, preserving its keyword", () => {
    const editor = makeMockEditor([
      "outcome: O",
      "  need: Opp",
      "    solution: Old solution",
    ]);
    const { app, ctx, el } = fakeCtx(editor);
    expect(renameOSTNode(app, ctx, el, "solution", 2, "Old solution", "New solution")).toBe(true);
    expect(editor._state[2]).toBe("    solution: New solution");
  });

  it("renames a pain node using its own keyword", () => {
    const editor = makeMockEditor(["outcome: O", "  pain: Old pain"]);
    const { app, ctx, el } = fakeCtx(editor);
    expect(renameOSTNode(app, ctx, el, "pain", 1, "Old pain", "New pain")).toBe(true);
    expect(editor._state[1]).toBe("  pain: New pain");
  });

  it("adds an opportunity indented under the outcome with the canonical 'need' keyword", () => {
    const editor = makeMockEditor(["outcome: O", "```"]);
    const { app, ctx, el } = fakeCtx(editor);
    expect(addOSTChild(app, ctx, el, "outcome", 0, "O", "New opportunity")).toBe(true);
    expect(editor._state).toEqual(["outcome: O", "  need: New opportunity", "```"]);
  });

  it("adds a solution under a desire opportunity, one level deeper", () => {
    const editor = makeMockEditor(["outcome: O", "  desire: Opp", "```"]);
    const { app, ctx, el } = fakeCtx(editor);
    expect(addOSTChild(app, ctx, el, "desire", 1, "Opp", "New solution")).toBe(true);
    expect(editor._state).toEqual([
      "outcome: O",
      "  desire: Opp",
      "    solution: New solution",
      "```",
    ]);
  });

  it("deletes a solution and its subtree", () => {
    const editor = makeMockEditor([
      "outcome: O",
      "  need: Opp",
      "    solution: Doomed",
      "      experiment: E",
      "    solution: Kept",
    ]);
    const { app, ctx, el } = fakeCtx(editor);
    expect(deleteOSTNode(app, ctx, el, "solution", 2, "Doomed")).toBe(true);
    expect(editor._state).toEqual([
      "outcome: O",
      "  need: Opp",
      "    solution: Kept",
    ]);
  });

  it("refuses to delete the outcome root", () => {
    const editor = makeMockEditor(["outcome: O", "  need: Opp"]);
    const { app, ctx, el } = fakeCtx(editor);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(deleteOSTNode(app, ctx, el, "outcome", 0, "O")).toBe(false);
    warn.mockRestore();
  });

  // ── Bullets ────────────────────────────────────────────────────────────────

  it("adds a bullet after a node's existing bullets", () => {
    const editor = makeMockEditor([
      "outcome: O",
      "  need: N",
      "    solution: S",
      "      First bullet",
      "```",
    ]);
    const { app, ctx, el } = fakeCtx(editor);
    expect(addOSTBullet(app, ctx, el, "solution", "S", "Second bullet")).toBe(true);
    expect(editor._state).toEqual([
      "outcome: O",
      "  need: N",
      "    solution: S",
      "      First bullet",
      "      Second bullet",
      "```",
    ]);
  });

  it("adds the first bullet directly under a bullet-less node", () => {
    const editor = makeMockEditor(["outcome: O", "  need: N", "    solution: S", "```"]);
    const { app, ctx, el } = fakeCtx(editor);
    expect(addOSTBullet(app, ctx, el, "solution", "S", "Only bullet")).toBe(true);
    expect(editor._state).toEqual([
      "outcome: O",
      "  need: N",
      "    solution: S",
      "      Only bullet",
      "```",
    ]);
  });

  it("edits a bullet in place, leaving keyword children untouched", () => {
    const editor = makeMockEditor([
      "outcome: O",
      "  need: N",
      "    solution: S",
      "      Old bullet",
      "      experiment: E",
    ]);
    const { app, ctx, el } = fakeCtx(editor);
    expect(editOSTBullet(app, ctx, el, "solution", "S", "Old bullet", "New bullet")).toBe(true);
    expect(editor._state[3]).toBe("      New bullet");
    expect(editor._state[4]).toBe("      experiment: E");
  });

  it("deletes a single bullet", () => {
    const editor = makeMockEditor([
      "outcome: O",
      "  need: N",
      "    solution: S",
      "      Keep me",
      "      Remove me",
    ]);
    const { app, ctx, el } = fakeCtx(editor);
    expect(deleteOSTBullet(app, ctx, el, "solution", "S", "Remove me")).toBe(true);
    expect(editor._state).toEqual([
      "outcome: O",
      "  need: N",
      "    solution: S",
      "      Keep me",
    ]);
  });
});
