// @vitest-environment happy-dom
/**
 * Tests for resolveEditor — the shared editor/line-range resolver used by
 * every write-back path (block-edit, tree-edit modules, wardley, story,
 * roadmap, sipoc, raci, pacelayers, title-edit).
 *
 * Covers three scenarios:
 *  1. getSectionInfo() returns correct, current info — used directly.
 *  2. getSectionInfo() returns null (Live Preview) — falls back to scanning
 *     the editor for the fence matching dataset.vzSource.
 *  3. getSectionInfo() returns STALE but non-null info (a real Obsidian
 *     Live Preview behavior where a code-block widget reports the wrong line
 *     range right after it mounts) — must be detected and recovered via the
 *     same vzSource fallback, not trusted blindly.
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("obsidian", () => ({
  MarkdownView: class MockMarkdownView {
    file: unknown = null;
    editor: unknown = null;
  },
}));

import { resolveEditor } from "./editor";
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
  view.containerEl = document.createElement("div"); // single-pane case: content of `el` is irrelevant, just must exist
  return {
    vault: { getFileByPath: (p: string) => (p === sourcePath ? { path: p } : null) },
    workspace: { getLeavesOfType: () => (editor ? [{ view }] : []) },
  };
}

describe("resolveEditor", () => {
  it("uses getSectionInfo directly when it points at the real block", () => {
    const editor = makeMockEditor(["```swot", "block: Strengths", "  old", "```"]);
    const app = makeApp("note.md", editor) as any;
    const ctx = { sourcePath: "note.md", getSectionInfo: () => ({ lineStart: 0, lineEnd: 3, text: "" }) } as any;
    const el = document.createElement("div");
    el.dataset.vzSource = "block: Strengths\n  old";

    const res = resolveEditor(app, ctx, el, "test");
    expect(res).toEqual({ editor, lineStart: 0, lineEnd: 3 });
  });

  it("falls back to the vzSource scan when getSectionInfo returns null", () => {
    const editor = makeMockEditor(["```swot", "block: Strengths", "  old", "```"]);
    const app = makeApp("note.md", editor) as any;
    const ctx = { sourcePath: "note.md", getSectionInfo: () => null } as any;
    const el = document.createElement("div");
    el.dataset.vzSource = "block: Strengths\n  old";

    const res = resolveEditor(app, ctx, el, "test");
    expect(res).toEqual({ editor, lineStart: 0, lineEnd: 3 });
  });

  it("recovers via the vzSource scan when getSectionInfo returns STALE non-null bounds", () => {
    // The real Live Preview bug: getSectionInfo is non-null but points at the
    // wrong lines (e.g. leftover from before the widget mounted). Blindly
    // trusting this would make writeBlockContent search the wrong range and
    // fail with "block not found" — even though the block genuinely exists.
    const editor = makeMockEditor([
      "some preceding note text",
      "```swot",
      "block: Strengths",
      "  old",
      "```",
    ]);
    const app = makeApp("note.md", editor) as any;
    // Stale info claims the block is at lines 0-0 — nowhere near the real fence.
    const ctx = { sourcePath: "note.md", getSectionInfo: () => ({ lineStart: 0, lineEnd: 0, text: "" }) } as any;
    const el = document.createElement("div");
    el.dataset.vzSource = "block: Strengths\n  old";

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = resolveEditor(app, ctx, el, "test");
    warn.mockRestore();

    expect(res).toEqual({ editor, lineStart: 1, lineEnd: 4 });
  });

  it("returns null when info is stale and there is no vzSource to recover with", () => {
    const editor = makeMockEditor(["unrelated line", "```swot", "block: Strengths", "```"]);
    const app = makeApp("note.md", editor) as any;
    const ctx = { sourcePath: "note.md", getSectionInfo: () => ({ lineStart: 0, lineEnd: 0, text: "" }) } as any;
    const el = document.createElement("div"); // no vzSource set

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = resolveEditor(app, ctx, el, "test");
    warn.mockRestore();

    // No vzSource to validate against, so the (stale) info is used as-is —
    // matches prior behaviour when nothing better is available.
    expect(res).toEqual({ editor, lineStart: 0, lineEnd: 0 });
  });

  it("picks the pane whose DOM contains the clicked canvas when the same file is open in multiple panes", () => {
    // Two leaves show the same file (a split pane), each with its own editor
    // instance and DOM subtree. The element the user actually clicked lives
    // in the second pane's DOM — resolveEditor must return THAT editor, not
    // just the first leaf found.
    const editorA = makeMockEditor(["```swot", "block: Strengths", "  A's version", "```"]);
    const editorB = makeMockEditor(["```swot", "block: Strengths", "  B's version", "```"]);

    const viewA = Object.create((MarkdownView as any).prototype) as any;
    viewA.file = { path: "note.md" };
    viewA.editor = editorA;
    viewA.containerEl = document.createElement("div");

    const viewB = Object.create((MarkdownView as any).prototype) as any;
    viewB.file = { path: "note.md" };
    viewB.editor = editorB;
    viewB.containerEl = document.createElement("div");

    const el = document.createElement("div");
    viewB.containerEl.appendChild(el); // el lives inside pane B's DOM

    const app = {
      vault: { getFileByPath: (p: string) => (p === "note.md" ? { path: p } : null) },
      workspace: { getLeavesOfType: () => [{ view: viewA }, { view: viewB }] },
    } as any;
    const ctx = { sourcePath: "note.md", getSectionInfo: () => ({ lineStart: 0, lineEnd: 3, text: "" }) } as any;

    const res = resolveEditor(app, ctx, el, "test");
    expect(res?.editor).toBe(editorB);
  });

  it("scans past a nested example fence with fewer backticks than the opening fence", () => {
    // A canvas whose body legitimately contains a fenced example (e.g. a
    // SIPOC/Fishbone note cell) is only valid Markdown if the outer fence
    // uses MORE backticks than the inner one (```` vs ```). The scan must
    // require a closing fence with at least as many backticks as the
    // opening one, not just any bare "```" line — otherwise it would stop
    // at the inner fence and never find the real closing line.
    const editor = makeMockEditor([
      "````vizardry",
      "block: Notes",
      "  Example:",
      "  ```",
      "  some code",
      "  ```",
      "````",
    ]);
    const app = makeApp("note.md", editor) as any;
    const ctx = { sourcePath: "note.md", getSectionInfo: () => null } as any;
    const el = document.createElement("div");
    el.dataset.vzSource = "block: Notes\n  Example:\n  ```\n  some code\n  ```";

    const res = resolveEditor(app, ctx, el, "test");
    expect(res).toEqual({ editor, lineStart: 0, lineEnd: 6 });
  });

  it("returns null when neither section info nor vzSource resolve a fence", () => {
    const editor = makeMockEditor(["no fence here at all"]);
    const app = makeApp("note.md", editor) as any;
    const ctx = { sourcePath: "note.md", getSectionInfo: () => null } as any;
    const el = document.createElement("div");
    el.dataset.vzSource = "block: Strengths\n  old";

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(resolveEditor(app, ctx, el, "test")).toBeNull();
    warn.mockRestore();
  });
});
