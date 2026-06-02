// @vitest-environment happy-dom

import { describe, it, expect, vi } from "vitest";

vi.mock("obsidian", () => ({
  MarkdownView: class MockMarkdownView {
    file: unknown = null;
    editor: unknown = null;
  },
}));

import { addWardleyComponent, removeWardleyLink } from "./wardley-edit";
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

describe("addWardleyComponent", () => {
  it("adds a new component with the requested default name when unused", () => {
    const lines = [
      "```wardley",
      "component: User [1.00, 0.10]",
      "component: API [0.80, 0.40]",
      "```",
    ];
    const editor = makeMockEditor(lines);
    const app = makeApp("note.md", editor) as any;
    const ctx = makeCtx("note.md", 0, 3) as any;
    const el = document.createElement("div");

    const ok = addWardleyComponent(app, ctx, el, "User", "New Component", 0.5, 0.6, true);

    expect(ok).toBe(true);
    expect(editor.replaceRange).toHaveBeenCalledTimes(2);
    expect(editor.replaceRange.mock.calls[0][0]).toBe("link: User -> New Component\n");
    expect(editor.replaceRange.mock.calls[1][0]).toContain("component: New Component [0.50, 0.60]");
  });

  it("auto-suffixes name when default already exists so each added node is unique", () => {
    const lines = [
      "```wardley",
      "component: User [1.00, 0.10]",
      "component: New Component [0.70, 0.40]",
      "component: New Component 2 [0.55, 0.65]",
      "```",
    ];
    const editor = makeMockEditor(lines);
    const app = makeApp("note.md", editor) as any;
    const ctx = makeCtx("note.md", 0, 4) as any;
    const el = document.createElement("div");

    const ok = addWardleyComponent(app, ctx, el, "User", "New Component", 0.2, 0.3, true);

    expect(ok).toBe(true);
    expect(editor.replaceRange).toHaveBeenCalledTimes(2);
    expect(editor.replaceRange.mock.calls[0][0]).toBe("link: User -> New Component 3\n");
    expect(editor.replaceRange.mock.calls[1][0]).toContain("component: New Component 3 [0.20, 0.30]");
  });
});

describe("removeWardleyLink", () => {
  it("removes the matching link: line from source", () => {
    const lines = [
      "```wardley",
      "component: User [1.00, 0.10]",
      "component: API [0.80, 0.40]",
      "link: User -> API",
      "```",
    ];
    const editor = makeMockEditor(lines);
    const app = makeApp("note.md", editor) as any;
    const ctx = makeCtx("note.md", 0, 4) as any;
    const el = document.createElement("div");

    const ok = removeWardleyLink(app, ctx, el, "User", "API");

    expect(ok).toBe(true);
    expect(editor.replaceRange).toHaveBeenCalledTimes(1);
    expect(editor.replaceRange.mock.calls[0][0]).toBe("");
    expect(editor.replaceRange.mock.calls[0][1]).toEqual({ line: 3, ch: 0 });
    expect(editor.replaceRange.mock.calls[0][2]).toEqual({ line: 4, ch: 0 });
  });

  it("matches case-insensitively", () => {
    const lines = [
      "```wardley",
      "component: User [1.00, 0.10]",
      "link: user -> api",
      "```",
    ];
    const editor = makeMockEditor(lines);
    const app = makeApp("note.md", editor) as any;
    const ctx = makeCtx("note.md", 0, 3) as any;
    const el = document.createElement("div");

    const ok = removeWardleyLink(app, ctx, el, "User", "API");

    expect(ok).toBe(true);
  });

  it("returns false when the link does not exist", () => {
    const lines = [
      "```wardley",
      "component: User [1.00, 0.10]",
      "```",
    ];
    const editor = makeMockEditor(lines);
    const app = makeApp("note.md", editor) as any;
    const ctx = makeCtx("note.md", 0, 2) as any;
    const el = document.createElement("div");

    const ok = removeWardleyLink(app, ctx, el, "User", "Missing");

    expect(ok).toBe(false);
    expect(editor.replaceRange).not.toHaveBeenCalled();
  });
});
