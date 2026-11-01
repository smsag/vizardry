// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";

vi.mock("obsidian", () => ({
  MarkdownView: class MockMarkdownView {
    file: unknown = null;
    editor: unknown = null;
  },
}));

import { appendRACITask, rewriteRoleLines, writeRACIRoles, writeRACIRolesMany } from "./raci-edit";
import { MarkdownView } from "obsidian";

/** An editor over a real line array, so successive writes see each other. */
function makeEditor(lines: string[]) {
  const doc = { text: lines.join("\n") };
  const all = () => doc.text.split("\n");
  const offset = (p: { line: number; ch: number }) =>
    all().slice(0, p.line).reduce((n, l) => n + l.length + 1, 0) + p.ch;
  return {
    getLine: (n: number) => all()[n] ?? "",
    lineCount: () => all().length,
    replaceRange: (text: string, from: { line: number; ch: number }, to?: { line: number; ch: number }) => {
      const a = offset(from), b = offset(to ?? from);
      doc.text = doc.text.slice(0, a) + text + doc.text.slice(b);
    },
    lines: all,
  };
}

function makeApp(editor: ReturnType<typeof makeEditor>): any {
  const view = Object.create((MarkdownView as any).prototype);
  view.file = { path: "n.md" };
  view.editor = editor;
  return {
    vault: { getFileByPath: (p: string) => (p === "n.md" ? { path: p } : null) },
    workspace: { getLeavesOfType: () => [{ view }] },
  };
}

const ctxFor = (editor: ReturnType<typeof makeEditor>) =>
  ({ sourcePath: "n.md", getSectionInfo: () => ({ lineStart: 0, lineEnd: editor.lineCount() - 1, text: "" }) }) as never;

const FENCE = [
  "```vizardry",
  "type: raci",
  "",
  "task: Build",
  "  responsible: Dev",
  "  // owner confirmed",
  "  consulted: QA, Dev",
  "",
  "task: Ship",
  "  accountable: PM",
  "```",
];

describe("rewriteRoleLines", () => {
  it("rewrites, drops and appends role lines, keeping comments and indent", () => {
    const sub = ["    responsible: Dev", "  // note", "  consulted: QA"];
    expect(rewriteRoleLines(sub, { responsible: "Dev, QA", accountable: "PM", consulted: "", informed: "" }))
      .toEqual(["    responsible: Dev, QA", "  // note", "  accountable: PM"]);
  });
});

describe("writeRACIRoles", () => {
  it("moves a person between roles in one task without touching the next", () => {
    const editor = makeEditor([...FENCE]);
    const ok = writeRACIRoles(makeApp(editor), ctxFor(editor), document.createElement("div"), 0,
      { responsible: "Dev", accountable: "QA", consulted: "", informed: "" });
    expect(ok).toBe(true);
    expect(editor.lines()).toEqual([
      "```vizardry", "type: raci", "",
      "task: Build", "  responsible: Dev", "  // owner confirmed", "  accountable: QA",
      "", "task: Ship", "  accountable: PM", "```",
    ]);
  });

  it("adds role lines to a task that has none", () => {
    const editor = makeEditor(["```vizardry", "type: raci", "task: Solo", "```"]);
    writeRACIRoles(makeApp(editor), ctxFor(editor), document.createElement("div"), 0,
      { responsible: "Ann", accountable: "", consulted: "", informed: "Bo" });
    expect(editor.lines()).toEqual(["```vizardry", "type: raci", "task: Solo", "  responsible: Ann", "  informed: Bo", "```"]);
  });

  it("reports failure when the task is not in the block", () => {
    const editor = makeEditor([...FENCE]);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(writeRACIRoles(makeApp(editor), ctxFor(editor), document.createElement("div"), 5,
      { responsible: "", accountable: "", consulted: "", informed: "" })).toBe(false);
  });
});

describe("writeRACIRolesMany", () => {
  it("rewrites several tasks in one pass, whatever order they are given in", () => {
    const editor = makeEditor([...FENCE]);
    const updates = new Map([
      [0, { responsible: "Alex", accountable: "", consulted: "QA, Alex", informed: "" }],
      [1, { responsible: "Alex", accountable: "PM", consulted: "", informed: "" }],
    ]);
    expect(writeRACIRolesMany(makeApp(editor), ctxFor(editor), document.createElement("div"), updates)).toBe(true);
    expect(editor.lines()).toEqual([
      "```vizardry", "type: raci", "",
      "task: Build", "  responsible: Alex", "  // owner confirmed", "  consulted: QA, Alex",
      "", "task: Ship", "  accountable: PM", "  responsible: Alex", "```",
    ]);
  });
});

describe("appendRACITask", () => {
  it("adds a task after the last content line, separated by a blank line", () => {
    const editor = makeEditor([...FENCE.slice(0, -1), "", "```"]);
    appendRACITask(makeApp(editor), ctxFor(editor), document.createElement("div"), "New task");
    expect(editor.lines().slice(-5)).toEqual(["  accountable: PM", "", "task: New task", "", "```"]);
  });
});
