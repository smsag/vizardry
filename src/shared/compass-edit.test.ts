// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";

vi.mock("obsidian", () => ({
  MarkdownView: class MockMarkdownView { file: unknown = null; editor: unknown = null; },
}));

import { readCompassValue, writeCompassValue, removeCompassValue, insertCompassValue } from "./compass-edit";
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
  "```vizardry",          // 0
  "type: compass",        // 1
  "title: Brief",         // 2
  "forces: Push",         // 3
  "idea: Wizard [x](canvas:OST)", // 4  (raw keeps the annotation)
  "idea: Defaults",       // 5
  "gtm: Ship first",      // 6
  "```",                  // 7
];

describe("compass-edit", () => {
  it("reads the raw value (annotation preserved) of the Nth line of a key", () => {
    const app = makeApp("n.md", makeMockEditor([...FENCE]));
    expect(readCompassValue(app, makeCtx("n.md", 0, 7) as never, el(), "idea", 0)).toBe("Wizard [x](canvas:OST)");
    expect(readCompassValue(app, makeCtx("n.md", 0, 7) as never, el(), "idea", 1)).toBe("Defaults");
  });

  it("rewrites the value of the Nth line of a key, preserving the keyword", () => {
    const editor = makeMockEditor([...FENCE]);
    const app = makeApp("n.md", editor);
    writeCompassValue(app, makeCtx("n.md", 0, 7) as never, el(), "idea", 1, "Smart defaults");
    expect(editor.replaceRange).toHaveBeenCalledWith(
      "idea: Smart defaults",
      { line: 5, ch: 0 },
      { line: 5, ch: FENCE[5].length },
    );
  });

  it("deletes the Nth line of a key", () => {
    const editor = makeMockEditor([...FENCE]);
    const app = makeApp("n.md", editor);
    removeCompassValue(app, makeCtx("n.md", 0, 7) as never, el(), "idea", 0);
    expect(editor.replaceRange).toHaveBeenCalledWith("", { line: 4, ch: 0 }, { line: 5, ch: 0 });
  });

  it("appends a new line after that key's last line", () => {
    const editor = makeMockEditor([...FENCE]);
    const app = makeApp("n.md", editor);
    insertCompassValue(app, makeCtx("n.md", 0, 7) as never, el(), "idea", "New idea");
    // Last idea line is line 5 ("idea: Defaults").
    expect(editor.replaceRange).toHaveBeenCalledWith(
      "\nidea: New idea",
      { line: 5, ch: FENCE[5].length },
    );
  });

  it("returns false / null in Read View (no editor)", () => {
    const app = makeApp("n.md", null);
    expect(writeCompassValue(app, makeCtx("n.md", 0, 7) as never, el(), "idea", 0, "x")).toBe(false);
    expect(readCompassValue(app, makeCtx("n.md", 0, 7) as never, el(), "idea", 0)).toBeNull();
  });
});
