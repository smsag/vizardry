// @vitest-environment happy-dom

import { describe, it, expect, vi } from "vitest";

vi.mock("obsidian", () => ({
  MarkdownView: class MockMarkdownView {
    file: unknown = null;
    editor: unknown = null;
  },
}));

import {
  writeNodeMapBoxPosition, addNodeMapBox, removeNodeMapBox, renameNodeMapBox,
  writeNodeMapBoxBody, setNodeMapBoxColor, addNodeMapLink, removeNodeMapLink,
  setNodeMapLinkStyle,
} from "./nodemap-edit";
import { MarkdownView } from "obsidian";

function makeMockEditor(lines: string[]) {
  const replaceRange = vi.fn();
  return {
    getLine: (n: number) => lines[n] ?? "",
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

describe("writeNodeMapBoxPosition", () => {
  it("replaces only the x/y values, preserving color", () => {
    const lines = ["```vizardry", "box: Customer [x: 10, y: 20, color: blue]", "```"];
    const editor = makeMockEditor(lines);
    const app = makeApp("note.md", editor) as any;
    const ctx = makeCtx("note.md", 0, 2) as any;
    const el = document.createElement("div");

    const ok = writeNodeMapBoxPosition(app, ctx, el, "Customer", 100, 200);

    expect(ok).toBe(true);
    expect(editor.replaceRange.mock.calls[0][0]).toBe("box: Customer [x: 100, y: 200, color: blue]");
  });
});

describe("addNodeMapBox", () => {
  it("inserts a new box before the closing fence with a unique name", () => {
    const lines = ["```vizardry", "box: A [x: 0, y: 0]", "box: New Box [x: 5, y: 5]", "```"];
    const editor = makeMockEditor(lines);
    const app = makeApp("note.md", editor) as any;
    const ctx = makeCtx("note.md", 0, 3) as any;
    const el = document.createElement("div");

    const name = addNodeMapBox(app, ctx, el, 40, 60);

    expect(name).toBe("New Box 2");
    expect(editor.replaceRange.mock.calls[0][0]).toBe("box: New Box 2 [x: 40, y: 60]\n");
    expect(editor.replaceRange.mock.calls[0][1]).toEqual({ line: 3, ch: 0 });
  });
});

describe("removeNodeMapBox", () => {
  it("removes the box's own line, its body, and every referencing link (bottom-up)", () => {
    const lines = [
      "```vizardry",
      "box: A [x: 0, y: 0]",
      "box: B [x: 10, y: 10]",
      "  some body text",
      "box: C [x: 20, y: 20]",
      "link: A -> B",
      "link: B -> C",
      "```",
    ];
    const editor = makeMockEditor(lines);
    const app = makeApp("note.md", editor) as any;
    const ctx = makeCtx("note.md", 0, 7) as any;
    const el = document.createElement("div");

    const ok = removeNodeMapBox(app, ctx, el, "B");

    expect(ok).toBe(true);
    // Deleted lines: box B (2), its body (3), link A->B (5), link B->C (6) — 4 deletes, bottom-up.
    expect(editor.replaceRange).toHaveBeenCalledTimes(4);
    const deletedLines = editor.replaceRange.mock.calls.map((c: any[]) => c[1].line);
    expect(deletedLines).toEqual([6, 5, 3, 2]);
    for (const call of editor.replaceRange.mock.calls) expect(call[0]).toBe("");
  });
});

describe("renameNodeMapBox", () => {
  it("renames the box declaration and every link from/to occurrence", () => {
    const lines = [
      "```vizardry",
      "box: Old Name [x: 0, y: 0]",
      "box: B [x: 10, y: 10]",
      "link: Old Name -> B : ships to",
      "link: B <-> Old Name",
      "```",
    ];
    const editor = makeMockEditor(lines);
    const app = makeApp("note.md", editor) as any;
    const ctx = makeCtx("note.md", 0, 5) as any;
    const el = document.createElement("div");

    const ok = renameNodeMapBox(app, ctx, el, "Old Name", "New Name");

    expect(ok).toBe(true);
    expect(editor.replaceRange).toHaveBeenCalledTimes(3);
    expect(editor.replaceRange.mock.calls[0][0]).toBe("box: New Name [x: 0, y: 0]");
    expect(editor.replaceRange.mock.calls[1][0]).toBe("link: New Name -> B : ships to");
    expect(editor.replaceRange.mock.calls[2][0]).toBe("link: B <-> New Name");
  });
});

describe("writeNodeMapBoxBody", () => {
  it("inserts a body block where none existed", () => {
    const lines = ["```vizardry", "box: A [x: 0, y: 0]", "box: B [x: 10, y: 10]", "```"];
    const editor = makeMockEditor(lines);
    const app = makeApp("note.md", editor) as any;
    const ctx = makeCtx("note.md", 0, 3) as any;
    const el = document.createElement("div");

    const ok = writeNodeMapBoxBody(app, ctx, el, "A", "line one\nline two");

    expect(ok).toBe(true);
    expect(editor.replaceRange.mock.calls[0][0]).toBe("\n  line one\n  line two");
  });

  it("replaces an existing body block", () => {
    const lines = ["```vizardry", "box: A [x: 0, y: 0]", "  old line", "box: B [x: 10, y: 10]", "```"];
    const editor = makeMockEditor(lines);
    const app = makeApp("note.md", editor) as any;
    const ctx = makeCtx("note.md", 0, 4) as any;
    const el = document.createElement("div");

    const ok = writeNodeMapBoxBody(app, ctx, el, "A", "new line");

    expect(ok).toBe(true);
    expect(editor.replaceRange.mock.calls[0][0]).toBe("  new line");
  });

  it("removes the body block entirely when the new body is blank", () => {
    const lines = ["```vizardry", "box: A [x: 0, y: 0]", "  old line", "box: B [x: 10, y: 10]", "```"];
    const editor = makeMockEditor(lines);
    const app = makeApp("note.md", editor) as any;
    const ctx = makeCtx("note.md", 0, 4) as any;
    const el = document.createElement("div");

    const ok = writeNodeMapBoxBody(app, ctx, el, "A", "");

    expect(ok).toBe(true);
    expect(editor.replaceRange.mock.calls[0][0]).toBe("");
    expect(editor.replaceRange.mock.calls[0][1]).toEqual({ line: 2, ch: 0 });
    expect(editor.replaceRange.mock.calls[0][2]).toEqual({ line: 3, ch: 0 });
  });
});

describe("setNodeMapBoxColor", () => {
  it("inserts a color key when none is present", () => {
    const lines = ["```vizardry", "box: A [x: 0, y: 0]", "```"];
    const editor = makeMockEditor(lines);
    const app = makeApp("note.md", editor) as any;
    const ctx = makeCtx("note.md", 0, 2) as any;
    const el = document.createElement("div");

    const ok = setNodeMapBoxColor(app, ctx, el, "A", "blue");

    expect(ok).toBe(true);
    expect(editor.replaceRange.mock.calls[0][0]).toBe("box: A [x: 0, y: 0, color: blue]");
  });

  it("replaces an existing color key", () => {
    const lines = ["```vizardry", "box: A [x: 0, y: 0, color: red]", "```"];
    const editor = makeMockEditor(lines);
    const app = makeApp("note.md", editor) as any;
    const ctx = makeCtx("note.md", 0, 2) as any;
    const el = document.createElement("div");

    const ok = setNodeMapBoxColor(app, ctx, el, "A", "green");

    expect(ok).toBe(true);
    expect(editor.replaceRange.mock.calls[0][0]).toBe("box: A [x: 0, y: 0, color: green]");
  });

  it("clears an existing color key when passed null", () => {
    const lines = ["```vizardry", "box: A [x: 0, y: 0, color: red]", "```"];
    const editor = makeMockEditor(lines);
    const app = makeApp("note.md", editor) as any;
    const ctx = makeCtx("note.md", 0, 2) as any;
    const el = document.createElement("div");

    const ok = setNodeMapBoxColor(app, ctx, el, "A", null);

    expect(ok).toBe(true);
    expect(editor.replaceRange.mock.calls[0][0]).toBe("box: A [x: 0, y: 0]");
  });
});

describe("addNodeMapLink", () => {
  it("appends a new directed link before the closing fence", () => {
    const lines = ["```vizardry", "box: A [x: 0, y: 0]", "box: B [x: 10, y: 10]", "```"];
    const editor = makeMockEditor(lines);
    const app = makeApp("note.md", editor) as any;
    const ctx = makeCtx("note.md", 0, 3) as any;
    const el = document.createElement("div");

    const ok = addNodeMapLink(app, ctx, el, "A", "B");

    expect(ok).toBe(true);
    expect(editor.replaceRange.mock.calls[0][0]).toBe("link: A -> B\n");
    expect(editor.replaceRange.mock.calls[0][1]).toEqual({ line: 3, ch: 0 });
  });

  it("does not duplicate an existing link", () => {
    const lines = ["```vizardry", "box: A [x: 0, y: 0]", "box: B [x: 10, y: 10]", "link: A -> B", "```"];
    const editor = makeMockEditor(lines);
    const app = makeApp("note.md", editor) as any;
    const ctx = makeCtx("note.md", 0, 4) as any;
    const el = document.createElement("div");

    const ok = addNodeMapLink(app, ctx, el, "A", "B");

    expect(ok).toBe(false);
    expect(editor.replaceRange).not.toHaveBeenCalled();
  });
});

describe("removeNodeMapLink", () => {
  it("removes the matching link line", () => {
    const lines = ["```vizardry", "box: A [x: 0, y: 0]", "box: B [x: 10, y: 10]", "link: A -> B", "```"];
    const editor = makeMockEditor(lines);
    const app = makeApp("note.md", editor) as any;
    const ctx = makeCtx("note.md", 0, 4) as any;
    const el = document.createElement("div");

    const ok = removeNodeMapLink(app, ctx, el, "A", "B");

    expect(ok).toBe(true);
    expect(editor.replaceRange.mock.calls[0][0]).toBe("");
    expect(editor.replaceRange.mock.calls[0][1]).toEqual({ line: 3, ch: 0 });
  });
});

describe("setNodeMapLinkStyle", () => {
  it("rebuilds the line with a new color and style, preserving label", () => {
    const lines = ["```vizardry", "box: A [x: 0, y: 0]", "box: B [x: 10, y: 10]", "link: A -> B : ships", "```"];
    const editor = makeMockEditor(lines);
    const app = makeApp("note.md", editor) as any;
    const ctx = makeCtx("note.md", 0, 4) as any;
    const el = document.createElement("div");

    const ok = setNodeMapLinkStyle(app, ctx, el, "A", "B", { color: "red", style: "dashed" });

    expect(ok).toBe(true);
    expect(editor.replaceRange.mock.calls[0][0]).toBe("link: A -> B : ships [color: red, style: dashed]");
  });

  it("changes direction token", () => {
    const lines = ["```vizardry", "box: A [x: 0, y: 0]", "box: B [x: 10, y: 10]", "link: A -> B", "```"];
    const editor = makeMockEditor(lines);
    const app = makeApp("note.md", editor) as any;
    const ctx = makeCtx("note.md", 0, 4) as any;
    const el = document.createElement("div");

    const ok = setNodeMapLinkStyle(app, ctx, el, "A", "B", { direction: "bidirectional" });

    expect(ok).toBe(true);
    expect(editor.replaceRange.mock.calls[0][0]).toBe("link: A <-> B");
  });
});
