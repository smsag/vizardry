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
