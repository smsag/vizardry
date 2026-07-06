// @vitest-environment happy-dom
/**
 * Tests for writePaceLayerCell — the surgical write-back function for the
 * pacelayers canvas.
 *
 * Covers: replace existing key, insert new key, multi-line values,
 * stale lineEnd (ctx reuse bug), orphaned fragment cleanup.
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("obsidian", () => ({
  MarkdownView: class MockMarkdownView {
    file: unknown = null;
    editor: unknown = null;
  },
}));

import { writePaceLayerCell } from "./pacelayers-edit";
import { MarkdownView } from "obsidian";

// ── Helpers ────────────────────────────────────────────────────────────────

function makeMockEditor(lines: string[]) {
  const replaceRange = vi.fn();
  return {
    getLine: (n: number) => lines[n] ?? "",
    lineCount: () => lines.length,
    replaceRange,
  };
}

type MockEditor = ReturnType<typeof makeMockEditor>;

function makeApp(sourcePath: string, editor: MockEditor | null) {
  const view = Object.create((MarkdownView as any).prototype) as any;
  view.file = { path: sourcePath };
  view.editor = editor;
  return {
    vault: {
      getFileByPath: (path: string) => (path === sourcePath ? { path } : null),
    },
    workspace: {
      getLeavesOfType: () => (editor ? [{ view }] : []),
    },
  };
}

function makeCtx(sourcePath: string, lineStart: number, lineEnd: number) {
  return {
    sourcePath,
    getSectionInfo: (_el: HTMLElement) => ({ lineStart, lineEnd, text: "" }),
  };
}

/** Build a connected div so el.isConnected = true */
function makeEl(): HTMLElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  return el;
}

// ── Typical template block ─────────────────────────────────────────────────
// Lines 0..19 represent the code block including all six layers.
// Culture starts at line 14, Nature at line 19.

const TEMPLATE_LINES = [
  "```pacelayers",           // 0
  "type: shearing",          // 1
  "context:",                // 2
  "",                        // 3
  "layer: Fashion",          // 4
  "  note:",                 // 5
  "",                        // 6
  "layer: Commerce",         // 7
  "  note:",                 // 8
  "",                        // 9
  "layer: Infrastructure",   // 10
  "  obs:",                  // 11
  "  feed:",                 // 12
  "  idea:",                 // 13
  "",                        // 14 (blank between Infrastructure and Governance)
  "layer: Governance",       // 15
  "  obs:",                  // 16
  "  feed:",                 // 17
  "  idea:",                 // 18
  "",                        // 19
  "layer: Culture",          // 20
  "  obs:",                  // 21
  "  feed:",                 // 22
  "  idea:",                 // 23
  "",                        // 24
  "layer: Nature",           // 25
  "  note:",                 // 26
  "```",                     // 27
];

// ── Tests ──────────────────────────────────────────────────────────────────

describe("writePaceLayerCell", () => {

  // ── Guard conditions ────────────────────────────────────────────────────

  it("returns false when getSectionInfo returns null", () => {
    const editor = makeMockEditor(TEMPLATE_LINES);
    const app = makeApp("note.md", editor) as any;
    const ctx = { sourcePath: "note.md", getSectionInfo: () => null } as any;
    const el = makeEl();
    expect(writePaceLayerCell(app, ctx, el, "Culture", "obs", "value")).toBe(false);
    expect(editor.replaceRange).not.toHaveBeenCalled();
  });

  it("returns false when vault file is not found", () => {
    const editor = makeMockEditor(TEMPLATE_LINES);
    const app = makeApp("other.md", editor) as any;
    const ctx = makeCtx("note.md", 0, 27) as any;
    const el = makeEl();
    expect(writePaceLayerCell(app, ctx, el, "Culture", "obs", "value")).toBe(false);
    expect(editor.replaceRange).not.toHaveBeenCalled();
  });

  it("returns false when no live editor is available", () => {
    const app = makeApp("note.md", null) as any;
    const ctx = makeCtx("note.md", 0, 27) as any;
    const el = makeEl();
    expect(writePaceLayerCell(app, ctx, el, "Culture", "obs", "value")).toBe(false);
  });

  it("returns false when layer header is not found", () => {
    const editor = makeMockEditor(TEMPLATE_LINES);
    const app = makeApp("note.md", editor) as any;
    const ctx = makeCtx("note.md", 0, 27) as any;
    const el = makeEl();
    expect(writePaceLayerCell(app, ctx, el, "Unknown", "obs", "value")).toBe(false);
    expect(editor.replaceRange).not.toHaveBeenCalled();
  });

  // ── Replace path — single-line value ────────────────────────────────────

  it("replaces an existing empty obs: key with a single-line value", () => {
    const lines = [...TEMPLATE_LINES];
    const editor = makeMockEditor(lines);
    const app = makeApp("note.md", editor) as any;
    const ctx = makeCtx("note.md", 0, 27) as any;
    const el = makeEl();

    expect(writePaceLayerCell(app, ctx, el, "Culture", "obs", "first line")).toBe(true);
    expect(editor.replaceRange).toHaveBeenCalledOnce();

    const [text, from, to] = editor.replaceRange.mock.calls[0];
    expect(text).toBe("  obs: first line");
    expect(from).toEqual({ line: 21, ch: 0 });
    expect(to).toEqual({ line: 21, ch: "  obs:".length });
  });

  it("replaces an existing obs: value with updated content", () => {
    const lines = [...TEMPLATE_LINES];
    lines[21] = "  obs: old value";
    const editor = makeMockEditor(lines);
    const app = makeApp("note.md", editor) as any;
    const ctx = makeCtx("note.md", 0, 27) as any;
    const el = makeEl();

    writePaceLayerCell(app, ctx, el, "Culture", "obs", "new value");

    const [text, from, to] = editor.replaceRange.mock.calls[0];
    expect(text).toBe("  obs: new value");
    expect(from).toEqual({ line: 21, ch: 0 });
    expect(to).toEqual({ line: 21, ch: "  obs: old value".length });
  });

  // ── Replace path — multi-line value (the key bug scenario) ───────────────

  it("writes a two-line value with properly indented continuation", () => {
    const lines = [...TEMPLATE_LINES];
    lines[21] = "  obs: first line";
    const editor = makeMockEditor(lines);
    const app = makeApp("note.md", editor) as any;
    const ctx = makeCtx("note.md", 0, 27) as any;
    const el = makeEl();

    writePaceLayerCell(app, ctx, el, "Culture", "obs", "first line\nsecond line");

    expect(editor.replaceRange).toHaveBeenCalledOnce();
    const [text, from, to] = editor.replaceRange.mock.calls[0];
    expect(text).toBe("  obs: first line\n  second line");
    // Replaces only the obs line — feed: must NOT be included in `to`
    expect(from).toEqual({ line: 21, ch: 0 });
    expect(to).toEqual({ line: 21, ch: "  obs: first line".length });
  });

  it("replaces existing multi-line value (obs + continuation) when adding a third line", () => {
    // Simulate the state AFTER a previous two-line write:
    // obs: first line
    //   second line      ← continuation
    // feed:
    // idea:
    const lines = [...TEMPLATE_LINES];
    lines[21] = "  obs: first line";
    lines.splice(22, 0, "  second line"); // insert continuation after obs
    // lines now has 29 entries; feed: shifted to 23, idea: to 24, blank to 25, Nature to 26+
    const editor = makeMockEditor(lines);
    const app = makeApp("note.md", editor) as any;
    const ctx = makeCtx("note.md", 0, lines.length - 1) as any;
    const el = makeEl();

    writePaceLayerCell(app, ctx, el, "Culture", "obs", "first line\nsecond line\nthird line");

    expect(editor.replaceRange).toHaveBeenCalledOnce();
    const [text, from, to] = editor.replaceRange.mock.calls[0];
    expect(text).toBe("  obs: first line\n  second line\n  third line");
    // `from` = start of obs line (21)
    expect(from).toEqual({ line: 21, ch: 0 });
    // `to` = end of continuation "  second line" (22)
    expect(to).toEqual({ line: 22, ch: "  second line".length });
  });

  it("does not include next sub-key in the replace range when extending obs", () => {
    const lines = [...TEMPLATE_LINES];
    lines[21] = "  obs: first line";
    lines[22] = "  feed: some feedback"; // feed has content
    const editor = makeMockEditor(lines);
    const app = makeApp("note.md", editor) as any;
    const ctx = makeCtx("note.md", 0, 27) as any;
    const el = makeEl();

    writePaceLayerCell(app, ctx, el, "Culture", "obs", "first line\nsecond line");

    const [, from, to] = editor.replaceRange.mock.calls[0];
    // Must stop before feed: line 22
    expect(from.line).toBe(21);
    expect(to.line).toBe(21); // only the obs line, no overrun into feed
  });

  // ── Replace path — feed and idea cells ──────────────────────────────────

  it("writes to feed: without disturbing obs:", () => {
    const lines = [...TEMPLATE_LINES];
    lines[21] = "  obs: stored";
    lines[22] = "  feed:";
    const editor = makeMockEditor(lines);
    const app = makeApp("note.md", editor) as any;
    const ctx = makeCtx("note.md", 0, 27) as any;
    const el = makeEl();

    writePaceLayerCell(app, ctx, el, "Culture", "feed", "feedback value");

    const [text, from, to] = editor.replaceRange.mock.calls[0];
    expect(text).toBe("  feed: feedback value");
    expect(from).toEqual({ line: 22, ch: 0 });
    expect(to).toEqual({ line: 22, ch: "  feed:".length });
  });

  // ── Insert path ─────────────────────────────────────────────────────────

  it("inserts obs: after the layer header when the key is absent", () => {
    // Culture block has only feed: and idea:, no obs:
    const lines = [
      "```pacelayers",
      "type: shearing",
      "layer: Culture",
      "  feed: existing",
      "  idea:",
      "layer: Nature",
      "  note:",
      "```",
    ];
    const editor = makeMockEditor(lines);
    const app = makeApp("note.md", editor) as any;
    const ctx = makeCtx("note.md", 0, 7) as any;
    const el = makeEl();

    writePaceLayerCell(app, ctx, el, "Culture", "obs", "new observation");

    expect(editor.replaceRange).toHaveBeenCalledOnce();
    const [text, from] = editor.replaceRange.mock.calls[0];
    expect(text).toBe("\n  obs: new observation");
    // Inserted after last non-blank, non-comment line in the body (idea: at line 4)
    expect(from).toEqual({ line: 4, ch: "  idea:".length });
  });

  // ── Stale lineEnd (ctx reuse bug) ────────────────────────────────────────

  it("finds Culture layer even when ctx.lineEnd is stale (too small)", () => {
    // Simulate: previous writes to Infrastructure/Governance added lines,
    // pushing Culture past the stale lineEnd. ctx.lineEnd reports 18 but
    // Culture is actually at line 20.
    const lines = [...TEMPLATE_LINES];
    const editor = makeMockEditor(lines);
    const app = makeApp("note.md", editor) as any;
    // lineEnd set to 15 — deliberately smaller than line 20 where Culture lives
    const ctx = makeCtx("note.md", 0, 15) as any;
    const el = makeEl();

    expect(writePaceLayerCell(app, ctx, el, "Culture", "obs", "found despite stale lineEnd")).toBe(true);
    const [text] = editor.replaceRange.mock.calls[0];
    expect(text).toBe("  obs: found despite stale lineEnd");
  });

  // ── Orphaned fragment cleanup ────────────────────────────────────────────

  it("overwrites an orphaned zero-indent fragment left by a previous bad write", () => {
    // Bad previous write left "second line" at zero-indent (the bug we fixed).
    const lines = [
      "```pacelayers",       // 0
      "type: shearing",      // 1
      "layer: Culture",      // 2
      "  obs: first line",   // 3
      "second line",         // 4 ← orphaned zero-indent fragment
      "  feed:",             // 5
      "  idea:",             // 6
      "layer: Nature",       // 7
      "  note:",             // 8
      "```",                 // 9
    ];
    const editor = makeMockEditor(lines);
    const app = makeApp("note.md", editor) as any;
    const ctx = makeCtx("note.md", 0, 9) as any;
    const el = makeEl();

    writePaceLayerCell(app, ctx, el, "Culture", "obs", "first line\nsecond line");

    expect(editor.replaceRange).toHaveBeenCalledOnce();
    const [text, from, to] = editor.replaceRange.mock.calls[0];
    // New value should be properly indented
    expect(text).toBe("  obs: first line\n  second line");
    // Range must extend to cover the orphaned fragment at line 4
    expect(from).toEqual({ line: 3, ch: 0 });
    expect(to).toEqual({ line: 4, ch: "second line".length });
  });

  // ── Note mode (Fashion / Commerce / Nature) ──────────────────────────────

  it("writes to note: key in Fashion layer", () => {
    const lines = [...TEMPLATE_LINES];
    const editor = makeMockEditor(lines);
    const app = makeApp("note.md", editor) as any;
    const ctx = makeCtx("note.md", 0, 27) as any;
    const el = makeEl();

    writePaceLayerCell(app, ctx, el, "Fashion", "note", "trend observation");

    const [text, from] = editor.replaceRange.mock.calls[0];
    expect(text).toBe("  note: trend observation");
    expect(from).toEqual({ line: 5, ch: 0 });
  });

  it("writes to note: key in Nature layer", () => {
    const lines = [...TEMPLATE_LINES];
    const editor = makeMockEditor(lines);
    const app = makeApp("note.md", editor) as any;
    const ctx = makeCtx("note.md", 0, 27) as any;
    const el = makeEl();

    writePaceLayerCell(app, ctx, el, "Nature", "note", "structural constraint");

    const [text, from] = editor.replaceRange.mock.calls[0];
    expect(text).toBe("  note: structural constraint");
    expect(from).toEqual({ line: 26, ch: 0 });
  });

  // ── Multi-line note ──────────────────────────────────────────────────────

  it("writes a multi-line value to a note: cell", () => {
    const lines = [...TEMPLATE_LINES];
    lines[5] = "  note: first";
    const editor = makeMockEditor(lines);
    const app = makeApp("note.md", editor) as any;
    const ctx = makeCtx("note.md", 0, 27) as any;
    const el = makeEl();

    writePaceLayerCell(app, ctx, el, "Fashion", "note", "first\nsecond");

    const [text] = editor.replaceRange.mock.calls[0];
    expect(text).toBe("  note: first\n  second");
  });

  // ── Type-specific alias in the source ───────────────────────────────────
  // The canvas only ever shows the type's display name, so a canvas authored
  // by hand may use it (e.g. "layer: Experiments") instead of the canonical
  // name ("layer: Fashion") that the DOM always passes as `layerName`.

  it("finds an alias-authored layer header when type is passed", () => {
    const lines = ["```pacelayers", "type: product", "layer: Experiments", "  note:", "```"];
    const editor = makeMockEditor(lines);
    const app = makeApp("note.md", editor) as any;
    const ctx = makeCtx("note.md", 0, 4) as any;
    const el = makeEl();

    const written = writePaceLayerCell(app, ctx, el, "Fashion", "note", "shipped fast", "product");

    expect(written).toBe(true);
    expect(editor.replaceRange).toHaveBeenCalledOnce();
    const [text, from, to] = editor.replaceRange.mock.calls[0];
    expect(text).toBe("  note: shipped fast");
    expect(from).toEqual({ line: 3, ch: 0 });
    expect(to).toEqual({ line: 3, ch: "  note:".length });
  });

  it("fails to find an alias-authored layer header when type is omitted", () => {
    const lines = ["```pacelayers", "type: product", "layer: Experiments", "  note:", "```"];
    const editor = makeMockEditor(lines);
    const app = makeApp("note.md", editor) as any;
    const ctx = makeCtx("note.md", 0, 4) as any;
    const el = makeEl();

    const written = writePaceLayerCell(app, ctx, el, "Fashion", "note", "shipped fast");

    expect(written).toBe(false);
    expect(editor.replaceRange).not.toHaveBeenCalled();
  });
});
