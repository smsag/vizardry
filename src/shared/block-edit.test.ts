// @vitest-environment happy-dom
/**
 * Tests for writeBlockContent — the surgical line-range patch that writes
 * inline block edits back to the source code block.
 *
 * We construct minimal fakes for App, MarkdownPostProcessorContext, and the
 * CodeMirror Editor so the function can be tested without Obsidian's runtime.
 *
 * The MarkdownView mock is declared via vi.mock so that `instanceof MarkdownView`
 * checks inside block-edit.ts resolve against the same class reference.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("obsidian", () => ({
  // Minimal MarkdownView stand-in — only the shape block-edit.ts touches.
  // `instanceof MarkdownView` works because both block-edit.ts and this test
  // import from the same vi.mock factory.
  MarkdownView: class MockMarkdownView {
    file: unknown = null;
    editor: unknown = null;
  },
}));

import { writeBlockContent, moveCardBetweenBlocks } from "./block-edit";
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
  // Build a view object that passes `instanceof MarkdownView` by setting its
  // prototype to the mocked class prototype. Cast to `any` throughout to avoid
  // satisfying Obsidian's full TFile / App types in test code.
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
  const el = document.createElement("div");
  return {
    sourcePath,
    getSectionInfo: (_el: HTMLElement) => ({ lineStart, lineEnd, text: "" }),
  };
}

function makeCtxNoInfo(sourcePath: string) {
  const el = document.createElement("div");
  return {
    sourcePath,
    getSectionInfo: (_el: HTMLElement) => null,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("writeBlockContent", () => {
  it("returns false when getSectionInfo returns null and no vzSource is set", () => {
    const editor = makeMockEditor([]);
    const app = makeApp("note.md", editor) as any;
    const ctx = makeCtxNoInfo("note.md") as any;
    const el = document.createElement("div");
    expect(writeBlockContent(app, ctx, el, "Strengths", "new")).toBe(false);
    expect(editor.replaceRange).not.toHaveBeenCalled();
  });

  it("saves via the vzSource fallback when getSectionInfo is null (Live Preview)", () => {
    // Live Preview: getSectionInfo() returns null, so resolveEditor scans the
    // editor for the code fence whose body matches the container's vzSource.
    const editor = makeMockEditor(["```swot", "block: Strengths", "  old", "```"]);
    const app = makeApp("note.md", editor) as any;
    const ctx = makeCtxNoInfo("note.md") as any;
    const el = document.createElement("div");
    el.dataset.vzSource = "block: Strengths\n  old";
    expect(writeBlockContent(app, ctx, el, "Strengths", "new")).toBe(true);
    expect(editor.replaceRange).toHaveBeenCalled();
  });

  it("warns and edits the first when two canvases share identical source", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // Two byte-identical fences; the content scan can't disambiguate them.
    const editor = makeMockEditor([
      "```swot", "block: Strengths", "  old", "```",
      "text between",
      "```swot", "block: Strengths", "  old", "```",
    ]);
    const app = makeApp("note.md", editor) as any;
    const ctx = makeCtxNoInfo("note.md") as any;
    const el = document.createElement("div");
    el.dataset.vzSource = "block: Strengths\n  old";

    expect(writeBlockContent(app, ctx, el, "Strengths", "new")).toBe(true);
    // Edits the FIRST fence (line range 0–3), deterministically.
    const [, from] = editor.replaceRange.mock.calls[0];
    expect(from.line).toBeLessThan(4);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("share identical source"));
    warn.mockRestore();
  });

  it("returns false when vault file is not found", () => {
    const editor = makeMockEditor(["```bmc", "block: Strengths", "  old", "```"]);
    const app = makeApp("other.md", editor) as any; // sourcePath mismatch
    const ctx = makeCtx("note.md", 0, 3) as any;
    const el = document.createElement("div");
    expect(writeBlockContent(app, ctx, el, "Strengths", "new")).toBe(false);
  });

  it("returns false when no live editor is available", () => {
    const app = makeApp("note.md", null) as any;
    const ctx = makeCtx("note.md", 0, 3) as any;
    const el = document.createElement("div");
    expect(writeBlockContent(app, ctx, el, "Strengths", "new")).toBe(false);
  });

  it("returns false when block label is not found in range", () => {
    const lines = ["```bmc", "block: Weaknesses", "  old", "```"];
    const editor = makeMockEditor(lines);
    const app = makeApp("note.md", editor) as any;
    const ctx = makeCtx("note.md", 0, 3) as any;
    const el = document.createElement("div");
    expect(writeBlockContent(app, ctx, el, "Strengths", "new")).toBe(false);
    expect(editor.replaceRange).not.toHaveBeenCalled();
  });

  it("replaces an existing indented body with new content", () => {
    // Lines:  0:```bmc  1:block: Strengths  2:  old line  3:block: Weaknesses  4:```
    const lines = ["```bmc", "block: Strengths", "  old line", "block: Weaknesses", "```"];
    const editor = makeMockEditor(lines);
    const app = makeApp("note.md", editor) as any;
    const ctx = makeCtx("note.md", 0, 4) as any;
    const el = document.createElement("div");

    const written = writeBlockContent(app, ctx, el, "Strengths", "new line");

    expect(written).toBe(true);
    expect(editor.replaceRange).toHaveBeenCalledOnce();
    const [replacement, from, to] = editor.replaceRange.mock.calls[0];
    expect(replacement).toBe("  new line");
    expect(from).toEqual({ line: 2, ch: 0 });
    expect(to).toEqual({ line: 2, ch: "  old line".length });
  });

  it("replaces a multi-line body", () => {
    const lines = ["```bmc", "block: Strengths", "  line one", "  line two", "block: Weaknesses", "```"];
    const editor = makeMockEditor(lines);
    const app = makeApp("note.md", editor) as any;
    const ctx = makeCtx("note.md", 0, 5) as any;
    const el = document.createElement("div");

    writeBlockContent(app, ctx, el, "Strengths", "line one\nline two\nline three");

    expect(editor.replaceRange).toHaveBeenCalledOnce();
    const [replacement, from, to] = editor.replaceRange.mock.calls[0];
    expect(replacement).toBe("  line one\n  line two\n  line three");
    expect(from).toEqual({ line: 2, ch: 0 });
    expect(to).toEqual({ line: 3, ch: "  line two".length });
  });

  it("inserts content when block body is empty", () => {
    // No indented lines follow the block header — body is empty
    const lines = ["```bmc", "block: Strengths", "block: Weaknesses", "```"];
    const editor = makeMockEditor(lines);
    const app = makeApp("note.md", editor) as any;
    const ctx = makeCtx("note.md", 0, 3) as any;
    const el = document.createElement("div");

    const written = writeBlockContent(app, ctx, el, "Strengths", "inserted");

    expect(written).toBe(true);
    expect(editor.replaceRange).toHaveBeenCalledOnce();
    const [replacement, from] = editor.replaceRange.mock.calls[0];
    expect(replacement).toBe("\n  inserted");
    // Inserted after the block header line
    expect(from).toEqual({ line: 1, ch: "block: Strengths".length });
  });

  it("writes empty string to clear a block body", () => {
    const lines = ["```bmc", "block: Strengths", "  to clear", "```"];
    const editor = makeMockEditor(lines);
    const app = makeApp("note.md", editor) as any;
    const ctx = makeCtx("note.md", 0, 3) as any;
    const el = document.createElement("div");

    writeBlockContent(app, ctx, el, "Strengths", "");

    const [replacement] = editor.replaceRange.mock.calls[0];
    expect(replacement).toBe("");
  });

  it("label match is case-insensitive", () => {
    const lines = ["```bmc", "block: Value Propositions", "  old", "```"];
    const editor = makeMockEditor(lines);
    const app = makeApp("note.md", editor) as any;
    const ctx = makeCtx("note.md", 0, 3) as any;
    const el = document.createElement("div");

    const written = writeBlockContent(app, ctx, el, "Value Propositions", "new");
    expect(written).toBe(true);
  });

  it("trims newValue before writing", () => {
    const lines = ["```bmc", "block: Strengths", "  old", "```"];
    const editor = makeMockEditor(lines);
    const app = makeApp("note.md", editor) as any;
    const ctx = makeCtx("note.md", 0, 3) as any;
    const el = document.createElement("div");

    writeBlockContent(app, ctx, el, "Strengths", "  padded value  ");

    const [replacement] = editor.replaceRange.mock.calls[0];
    expect(replacement).toBe("  padded value");
  });
});

describe("moveCardBetweenBlocks", () => {
  it("edits both blocks in one call, lower block first, regardless of source/dest order", () => {
    // Lines: 0 ``` 1 block: Strengths 2 old S 3 block: Weaknesses 4 old W 5 ```
    const lines = ["```bmc", "block: Strengths", "  old S", "block: Weaknesses", "  old W", "```"];
    const editor = makeMockEditor(lines);
    const app = makeApp("note.md", editor) as any;
    const ctx = makeCtx("note.md", 0, 5) as any;
    const el = document.createElement("div");

    const written = moveCardBetweenBlocks(
      app, ctx, el,
      { label: "Strengths", newContent: "new S" },
      { label: "Weaknesses", newContent: "new W" },
    );

    expect(written).toBe(true);
    expect(editor.replaceRange).toHaveBeenCalledTimes(2);
    // Weaknesses is lower in the file (line 3) than Strengths (line 1), so it
    // must be edited first — editing it doesn't shift Strengths' line numbers.
    const [firstReplacement, firstFrom] = editor.replaceRange.mock.calls[0];
    expect(firstFrom).toEqual({ line: 4, ch: 0 });
    expect(firstReplacement).toBe("  new W");
    const [secondReplacement, secondFrom] = editor.replaceRange.mock.calls[1];
    expect(secondFrom).toEqual({ line: 2, ch: 0 });
    expect(secondReplacement).toBe("  new S");
  });

  it("still edits lower-first when dest appears above source in the file", () => {
    // Lines: 0 ``` 1 block: Weaknesses 2 old W 3 block: Strengths 4 old S 5 ```
    const lines = ["```bmc", "block: Weaknesses", "  old W", "block: Strengths", "  old S", "```"];
    const editor = makeMockEditor(lines);
    const app = makeApp("note.md", editor) as any;
    const ctx = makeCtx("note.md", 0, 5) as any;
    const el = document.createElement("div");

    moveCardBetweenBlocks(
      app, ctx, el,
      { label: "Strengths", newContent: "new S" },
      { label: "Weaknesses", newContent: "new W" },
    );

    // Now Strengths (line 3) is lower than Weaknesses (line 1) — edited first.
    const [firstReplacement, firstFrom] = editor.replaceRange.mock.calls[0];
    expect(firstFrom).toEqual({ line: 4, ch: 0 });
    expect(firstReplacement).toBe("  new S");
    const [secondReplacement, secondFrom] = editor.replaceRange.mock.calls[1];
    expect(secondFrom).toEqual({ line: 2, ch: 0 });
    expect(secondReplacement).toBe("  new W");
  });

  it("inserts into an empty destination body", () => {
    const lines = ["```bmc", "block: Strengths", "  old S", "block: Weaknesses", "```"];
    const editor = makeMockEditor(lines);
    const app = makeApp("note.md", editor) as any;
    const ctx = makeCtx("note.md", 0, 4) as any;
    const el = document.createElement("div");

    const written = moveCardBetweenBlocks(
      app, ctx, el,
      { label: "Strengths", newContent: "" },
      { label: "Weaknesses", newContent: "moved card" },
    );

    expect(written).toBe(true);
    expect(editor.replaceRange).toHaveBeenCalledTimes(2);
    // Weaknesses (line 3, empty body) is lower — inserted after its header.
    const [firstReplacement, firstFrom] = editor.replaceRange.mock.calls[0];
    expect(firstReplacement).toBe("\n  moved card");
    expect(firstFrom).toEqual({ line: 3, ch: "block: Weaknesses".length });
  });

  it("returns false and applies no edits when the source block isn't found", () => {
    const lines = ["```bmc", "block: Weaknesses", "  old W", "```"];
    const editor = makeMockEditor(lines);
    const app = makeApp("note.md", editor) as any;
    const ctx = makeCtx("note.md", 0, 3) as any;
    const el = document.createElement("div");

    const written = moveCardBetweenBlocks(
      app, ctx, el,
      { label: "Strengths", newContent: "new S" },
      { label: "Weaknesses", newContent: "new W" },
    );

    expect(written).toBe(false);
    expect(editor.replaceRange).not.toHaveBeenCalled();
  });

  it("returns false and applies no edits when the destination block isn't found", () => {
    const lines = ["```bmc", "block: Strengths", "  old S", "```"];
    const editor = makeMockEditor(lines);
    const app = makeApp("note.md", editor) as any;
    const ctx = makeCtx("note.md", 0, 3) as any;
    const el = document.createElement("div");

    const written = moveCardBetweenBlocks(
      app, ctx, el,
      { label: "Strengths", newContent: "new S" },
      { label: "Weaknesses", newContent: "new W" },
    );

    expect(written).toBe(false);
    expect(editor.replaceRange).not.toHaveBeenCalled();
  });
});
