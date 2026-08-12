// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";

vi.mock("obsidian", () => ({
  MarkdownView: class MockMarkdownView {
    file: unknown = null;
    editor: unknown = null;
  },
}));

import { writeProblemCard, removeProblemCard, insertProblemCard } from "./problem-edit";
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

const STAGES = ["ideal", "reality", "consequences", "proposal"];
const FENCE = [
  "```vizardry",                              // 0
  "type: problem, engineering",               // 1
  "ideal_1: Fast line | Assembles.",          // 2
  "reality_1: Manual",                        // 3
  "reality_2: Rework",                        // 4
  "consequences_1: Missed goals",             // 5
  "link: ideal_1 -> reality_1",               // 6
  "```",                                      // 7
];
const el = () => document.createElement("div");

describe("writeProblemCard", () => {
  it("rewrites the Nth card's value as heading | body, preserving the key", () => {
    const editor = makeMockEditor([...FENCE]);
    const app = makeApp("n.md", editor);
    // Card index 1 = the 2nd card line (reality_1 at line 3), skipping the type/link lines.
    const ok = writeProblemCard(app, makeCtx("n.md", 0, 7) as never, el(), 1, STAGES, "Manual transport", "By hand");
    expect(ok).toBe(true);
    expect(editor.replaceRange).toHaveBeenCalledWith(
      "reality_1: Manual transport | By hand",
      { line: 3, ch: 0 },
      { line: 3, ch: FENCE[3].length },
    );
  });

  it("writes a heading-only value when the body is blank", () => {
    const editor = makeMockEditor([...FENCE]);
    const app = makeApp("n.md", editor);
    writeProblemCard(app, makeCtx("n.md", 0, 7) as never, el(), 0, STAGES, "Fully automated", "");
    expect(editor.replaceRange).toHaveBeenCalledWith(
      "ideal_1: Fully automated",
      { line: 2, ch: 0 },
      { line: 2, ch: FENCE[2].length },
    );
  });

  it("returns false in Read View (no editor)", () => {
    const app = makeApp("n.md", null);
    expect(writeProblemCard(app, makeCtx("n.md", 0, 7) as never, el(), 0, STAGES, "x", "")).toBe(false);
  });
});

describe("removeProblemCard", () => {
  it("deletes the Nth card's whole line", () => {
    const editor = makeMockEditor([...FENCE]);
    const app = makeApp("n.md", editor);
    // Index 2 = reality_2 at line 4.
    removeProblemCard(app, makeCtx("n.md", 0, 7) as never, el(), 2, STAGES);
    expect(editor.replaceRange).toHaveBeenCalledWith("", { line: 4, ch: 0 }, { line: 5, ch: 0 });
  });
});

describe("insertProblemCard", () => {
  it("appends a new card after the stage's last existing card", () => {
    const editor = makeMockEditor([...FENCE]);
    const app = makeApp("n.md", editor);
    insertProblemCard(app, makeCtx("n.md", 0, 7) as never, el(), "reality", STAGES, "New Reality");
    // Last reality card is line 4 ("reality_2: Rework").
    expect(editor.replaceRange).toHaveBeenCalledWith(
      "\nreality: New Reality",
      { line: 4, ch: FENCE[4].length },
    );
  });
});
