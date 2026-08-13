// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";

vi.mock("obsidian", () => ({
  MarkdownView: class MockMarkdownView {
    file: unknown = null;
    editor: unknown = null;
  },
}));

import { writeTestCardField, writeTestCardGauge } from "./testcard-edit";
import { MarkdownView } from "obsidian";

function makeMockEditor(lines: string[]) {
  const replaceRange = vi.fn();
  return { getLine: (n: number) => lines[n] ?? "", lineCount: () => lines.length, replaceRange };
}
type MockEditor = ReturnType<typeof makeMockEditor>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeApp(sourcePath: string, editor: MockEditor | null): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const view = Object.create((MarkdownView as any).prototype);
  view.file = { path: sourcePath };
  view.editor = editor;
  return {
    vault: { getFileByPath: (p: string) => (p === sourcePath ? { path: p } : null) },
    workspace: { getLeavesOfType: () => (editor ? [{ view }] : []) },
  };
}

function makeCtx(sourcePath: string, lineStart: number, lineEnd: number) {
  return { sourcePath, getSectionInfo: () => ({ lineStart, lineEnd, text: "" }) };
}

const el = () => document.createElement("div");
const FENCE = [
  "```vizardry",             // 0
  "type: testcard",          // 1
  "title: Pricing test",     // 2
  "hypothesis: SMBs pay",    // 3
  "critical: 2",             // 4
  "```",                     // 5
];

describe("writeTestCardField", () => {
  it("replaces an existing field's value in place, preserving the key", () => {
    const editor = makeMockEditor([...FENCE]);
    const app = makeApp("n.md", editor);
    writeTestCardField(app, makeCtx("n.md", 0, 5) as never, el(), "hypothesis", "SMBs will pay $49");
    expect(editor.replaceRange).toHaveBeenCalledWith(
      "hypothesis: SMBs will pay $49",
      { line: 3, ch: 0 },
      { line: 3, ch: FENCE[3].length },
    );
  });

  it("appends a new field after the last content line when the key is absent", () => {
    const editor = makeMockEditor([...FENCE]);
    const app = makeApp("n.md", editor);
    writeTestCardField(app, makeCtx("n.md", 0, 5) as never, el(), "metric", "Paid conversion");
    // Last content line inside the fence is line 4 ("critical: 2").
    expect(editor.replaceRange).toHaveBeenCalledWith(
      "\nmetric: Paid conversion",
      { line: 4, ch: FENCE[4].length },
    );
  });

  it("removes the line when the value is cleared to empty", () => {
    const editor = makeMockEditor([...FENCE]);
    const app = makeApp("n.md", editor);
    writeTestCardField(app, makeCtx("n.md", 0, 5) as never, el(), "hypothesis", "");
    expect(editor.replaceRange).toHaveBeenCalledWith("", { line: 3, ch: 0 }, { line: 4, ch: 0 });
  });

  it("returns false in Read View (no editor)", () => {
    const app = makeApp("n.md", null);
    expect(writeTestCardField(app, makeCtx("n.md", 0, 5) as never, el(), "hypothesis", "x")).toBe(false);
  });
});

describe("writeTestCardGauge", () => {
  it("writes the numeric level for a non-zero gauge", () => {
    const editor = makeMockEditor([...FENCE]);
    const app = makeApp("n.md", editor);
    writeTestCardGauge(app, makeCtx("n.md", 0, 5) as never, el(), "critical", 3);
    expect(editor.replaceRange).toHaveBeenCalledWith(
      "critical: 3",
      { line: 4, ch: 0 },
      { line: 4, ch: FENCE[4].length },
    );
  });

  it("removes the gauge line when cleared to 0", () => {
    const editor = makeMockEditor([...FENCE]);
    const app = makeApp("n.md", editor);
    writeTestCardGauge(app, makeCtx("n.md", 0, 5) as never, el(), "critical", 0);
    expect(editor.replaceRange).toHaveBeenCalledWith("", { line: 4, ch: 0 }, { line: 5, ch: 0 });
  });
});
