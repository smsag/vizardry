// @vitest-environment happy-dom

import { describe, it, expect, vi } from "vitest";

vi.mock("obsidian", () => ({
  MarkdownView: class MockMarkdownView {
    file: unknown = null;
    editor: unknown = null;
  },
}));

import { addWardleyComponent, removeWardleyLink, renameWardleyComponent, writeWardleyComponent, writeWardleyEvolve } from "./wardley-edit";
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

describe("writeWardleyComponent", () => {
  it("targets the exact component, not a longer name it prefixes", () => {
    // "Auth Service" comes first; dragging "Auth" must not rewrite its coords.
    const lines = [
      "```wardley",
      "component: Auth Service [0.60, 0.55]",
      "component: Auth [0.40, 0.30]",
      "```",
    ];
    const editor = makeMockEditor(lines);
    const app = makeApp("note.md", editor) as any;
    const ctx = makeCtx("note.md", 0, 3) as any;
    const el = document.createElement("div");

    const ok = writeWardleyComponent(app, ctx, el, "Auth", 0.9, 0.1);

    expect(ok).toBe(true);
    // Must patch line 2 (Auth), not line 1 (Auth Service).
    expect(editor.replaceRange.mock.calls[0][1]).toEqual({ line: 2, ch: 0 });
    expect(editor.replaceRange.mock.calls[0][0]).toBe("component: Auth [0.90, 0.10]");
  });

  it("preserves a trailing // comment when rewriting coordinates", () => {
    const lines = ["```wardley", "component: Web [0.5, 0.5] // the app", "```"];
    const editor = makeMockEditor(lines);
    const app = makeApp("note.md", editor) as any;
    const ctx = makeCtx("note.md", 0, 2) as any;
    const el = document.createElement("div");

    writeWardleyComponent(app, ctx, el, "Web", 0.8, 0.2);
    expect(editor.replaceRange.mock.calls[0][0]).toBe("component: Web [0.80, 0.20] // the app");
  });
});

describe("writeWardleyEvolve", () => {
  it("rewrites only the trailing evolution value, preserving name and comment", () => {
    const lines = ["```wardley", "component: Auth Service [0.6, 0.5]", "evolve: Auth Service 0.80 // to commodity", "```"];
    const editor = makeMockEditor(lines);
    const app = makeApp("note.md", editor) as any;
    const ctx = makeCtx("note.md", 0, 3) as any;
    const el = document.createElement("div");

    const ok = writeWardleyEvolve(app, ctx, el, "Auth Service", 0.92);
    expect(ok).toBe(true);
    expect(editor.replaceRange.mock.calls[0][0]).toBe("evolve: Auth Service 0.92 // to commodity");
    expect(editor.replaceRange.mock.calls[0][1]).toEqual({ line: 2, ch: 0 });
  });

  it("does not match a prefix name (Auth vs Auth Service)", () => {
    const lines = ["```wardley", "evolve: Auth Service 0.80", "```"];
    const editor = makeMockEditor(lines);
    const app = makeApp("note.md", editor) as any;
    const ctx = makeCtx("note.md", 0, 2) as any;
    const el = document.createElement("div");

    const ok = writeWardleyEvolve(app, ctx, el, "Auth", 0.5);
    expect(ok).toBe(false);
    expect(editor.replaceRange).not.toHaveBeenCalled();
  });
});

describe("renameWardleyComponent", () => {
  it("renames the component, anchor, links, evolve, and pipeline lines together", () => {
    const lines = [
      "```wardley",
      "anchor: Auth Service",
      "component: Auth Service [0.6, 0.5]",
      "component: Web [0.8, 0.3]",
      "link: Web -> Auth Service",
      "evolve: Auth Service 0.85",
      "pipeline: Auth Service [0.4, 0.8]",
      "  OAuth [0.6]",
      "```",
    ];
    const editor = makeMockEditor(lines);
    const app = makeApp("note.md", editor) as any;
    const ctx = makeCtx("note.md", 0, 8) as any;
    const el = document.createElement("div");

    const ok = renameWardleyComponent(app, ctx, el, "Auth Service", "Identity");

    expect(ok).toBe(true);
    const written = editor.replaceRange.mock.calls.map((c: any[]) => c[0]);
    expect(written).toContain("anchor: Identity");
    expect(written).toContain("component: Identity [0.6, 0.5]");
    expect(written).toContain("link: Web -> Identity");
    expect(written).toContain("evolve: Identity 0.85");
    expect(written).toContain("pipeline: Identity [0.4, 0.8]");
    // The sub-component line is untouched (it is not a component reference).
    expect(written).not.toContain("  OAuth [0.6]");
  });

  it("preserves a leading-dot evolve value when renaming", () => {
    const lines = ["```wardley", "component: Auth Service [0.6, 0.5]", "evolve: Auth Service .85", "```"];
    const editor = makeMockEditor(lines);
    const app = makeApp("note.md", editor) as any;
    const ctx = makeCtx("note.md", 0, 3) as any;
    const el = document.createElement("div");

    renameWardleyComponent(app, ctx, el, "Auth Service", "Identity");
    const written = editor.replaceRange.mock.calls.map((c: any[]) => c[0]);
    expect(written).toContain("evolve: Identity .85");
  });

  it("does not rename an evolve/pipeline for a prefix name (Auth vs Auth Service)", () => {
    const lines = [
      "```wardley",
      "component: Auth [0.5, 0.5]",
      "evolve: Auth Service 0.85",
      "pipeline: Auth Service [0.4, 0.8]",
      "  OAuth [0.6]",
      "```",
    ];
    const editor = makeMockEditor(lines);
    const app = makeApp("note.md", editor) as any;
    const ctx = makeCtx("note.md", 0, 5) as any;
    const el = document.createElement("div");

    renameWardleyComponent(app, ctx, el, "Auth", "Gate");
    const written = editor.replaceRange.mock.calls.map((c: any[]) => c[0]);
    expect(written).toContain("component: Gate [0.5, 0.5]");
    // "Auth Service" directives must be left alone.
    expect(written).not.toContain("evolve: Gate 0.85");
    expect(written).not.toContain("pipeline: Gate [0.4, 0.8]");
  });

  it("aborts (touching nothing) when the new name collides with a different component", () => {
    const lines = [
      "```wardley",
      "component: Auth [0.5, 0.5]",
      "component: Database [0.4, 0.6]",
      "```",
    ];
    const editor = makeMockEditor(lines);
    const app = makeApp("note.md", editor) as any;
    const ctx = makeCtx("note.md", 0, 3) as any;
    const el = document.createElement("div");

    const ok = renameWardleyComponent(app, ctx, el, "Auth", "Database");
    expect(ok).toBe(false);
    expect(editor.replaceRange).not.toHaveBeenCalled();
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
