// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";

vi.mock("obsidian", () => ({
  MarkdownView: class MockMarkdownView {
    file: unknown = null;
    editor: unknown = null;
  },
}));

import {
  flipProContraArg, insertProContraArg, insertProContraOption, removeProContraArg,
  removeProContraOption, renameProContraOption, writeProContraArgText,
  writeProContraArgWeight, writeProContraField,
} from "./procontra-edit";
import { MarkdownView } from "obsidian";

type Pos = { line: number; ch: number };

/** A tiny editor over a string that really applies replaceRange. */
function makeEditor(lines: string[]) {
  let text = lines.join("\n");
  const offset = (p: Pos): number => {
    const ls = text.split("\n");
    let o = 0;
    for (let i = 0; i < p.line; i++) o += ls[i].length + 1;
    return o + p.ch;
  };
  return {
    getLine: (n: number) => text.split("\n")[n] ?? "",
    lineCount: () => text.split("\n").length,
    replaceRange: (s: string, from: Pos, to: Pos = from) => {
      text = text.slice(0, offset(from)) + s + text.slice(offset(to));
    },
    text: () => text,
  };
}
type MockEditor = ReturnType<typeof makeEditor>;

function setup(lines: string[]) {
  const editor = makeEditor(lines);
  const view = Object.create((MarkdownView as unknown as { prototype: object }).prototype);
  view.file = { path: "n.md" };
  view.editor = editor;
  const app = {
    vault: { getFileByPath: (p: string) => (p === "n.md" ? { path: p } : null) },
    workspace: { getLeavesOfType: () => [{ view }] },
  } as never;
  const ctx = {
    sourcePath: "n.md",
    getSectionInfo: () => ({ lineStart: 0, lineEnd: editor.lineCount() - 1, text: "" }),
  } as never;
  return { editor, app, ctx, el: document.createElement("div") };
}

const body = (e: MockEditor): string[] => e.text().split("\n").slice(1, -1);

const MULTI = [
  "```vizardry",
  "type: procontra",
  "title: Move?",
  "option: Berlin",
  "  pro: Hiring pool | 3",
  "  con: Cost | 2",
  "option: Remote",
  "  pro: No disruption",
  "decision: Berlin",
  "```",
];

describe("argument edits", () => {
  it("rewrites text, keeping indentation, key and weight", () => {
    const { editor, app, ctx, el } = setup(MULTI);
    expect(writeProContraArgText(app, ctx, el, 1, "Relocation cost")).toBe(true);
    expect(editor.getLine(5)).toBe("  con: Relocation cost | 2");
  });

  it("sets the weight, dropping the suffix at the default 1", () => {
    const { editor, app, ctx, el } = setup(MULTI);
    writeProContraArgWeight(app, ctx, el, 2, 3);
    expect(editor.getLine(7)).toBe("  pro: No disruption | 3");
    writeProContraArgWeight(app, ctx, el, 0, 1);
    expect(editor.getLine(4)).toBe("  pro: Hiring pool");
  });

  it("flips an argument to the other column", () => {
    const { editor, app, ctx, el } = setup(MULTI);
    flipProContraArg(app, ctx, el, 0);
    expect(editor.getLine(4)).toBe("  con: Hiring pool | 3");
    flipProContraArg(app, ctx, el, 1);
    expect(editor.getLine(5)).toBe("  pro: Cost | 2");
  });

  it("deletes an argument line", () => {
    const { editor, app, ctx, el } = setup(MULTI);
    removeProContraArg(app, ctx, el, 1);
    expect(body(editor)).not.toContain("  con: Cost | 2");
    expect(body(editor)).toHaveLength(MULTI.length - 3);
  });

  it("returns false for an unknown ref", () => {
    const { app, ctx, el } = setup(MULTI);
    expect(writeProContraArgText(app, ctx, el, 99, "x")).toBe(false);
  });
});

describe("insertProContraArg", () => {
  it("adds after the option's last argument on the same side", () => {
    const { editor, app, ctx, el } = setup(MULTI);
    insertProContraArg(app, ctx, el, 0, "pro", "Customers nearby");
    expect(body(editor).slice(2, 6)).toEqual([
      "option: Berlin", "  pro: Hiring pool | 3", "  pro: Customers nearby", "  con: Cost | 2",
    ]);
  });

  it("adds under an option with no arguments, indented", () => {
    const { editor, app, ctx, el } = setup(["```vizardry", "option: A", "option: B", "```"]);
    insertProContraArg(app, ctx, el, 0, "con", "Risky");
    expect(body(editor)).toEqual(["option: A", "  con: Risky", "option: B"]);
  });

  it("adds to the implicit option at the end of a plain T-chart", () => {
    const { editor, app, ctx, el } = setup(["```vizardry", "title: T", "pro: a", "", "```"]);
    insertProContraArg(app, ctx, el, -1, "con", "b");
    expect(body(editor)).toEqual(["title: T", "pro: a", "con: b", ""]);
  });

  it("adds to an empty block after the last content line", () => {
    const { editor, app, ctx, el } = setup(["```vizardry", "type: procontra", "```"]);
    insertProContraArg(app, ctx, el, -1, "pro", "first");
    expect(body(editor)).toEqual(["type: procontra", "pro: first"]);
  });
});

describe("option edits", () => {
  it("renames an option and carries a matching decision along", () => {
    const { editor, app, ctx, el } = setup(MULTI);
    renameProContraOption(app, ctx, el, 0, "Berlin", "Munich");
    expect(editor.getLine(3)).toBe("option: Munich");
    expect(editor.getLine(8)).toBe("decision: Munich");
  });

  it("names the implicit option by inserting an option line and indenting", () => {
    const { editor, app, ctx, el } = setup(["```vizardry", "title: T", "pro: a", "con: b", "option: Other", "```"]);
    renameProContraOption(app, ctx, el, -1, "", "This one");
    expect(body(editor)).toEqual(["title: T", "option: This one", "  pro: a", "  con: b", "option: Other"]);
  });

  it("appends a new option after the last option block", () => {
    const { editor, app, ctx, el } = setup(MULTI);
    insertProContraOption(app, ctx, el, "Hybrid");
    expect(body(editor).slice(-2)).toEqual(["option: Hybrid", "decision: Berlin"]);
  });

  it("deletes an option with its arguments only", () => {
    const { editor, app, ctx, el } = setup(MULTI);
    removeProContraOption(app, ctx, el, 0);
    expect(body(editor)).toEqual(["type: procontra", "title: Move?", "option: Remote", "  pro: No disruption", "decision: Berlin"]);
  });
});

describe("writeProContraField", () => {
  it("updates, clears and inserts the decision", () => {
    const { editor, app, ctx, el } = setup(MULTI);
    writeProContraField(app, ctx, el, "decision", "Remote");
    expect(editor.getLine(8)).toBe("decision: Remote");
    writeProContraField(app, ctx, el, "decision", "");
    expect(body(editor).some(l => l.startsWith("decision:"))).toBe(false);
    writeProContraField(app, ctx, el, "decision", "Berlin");
    expect(body(editor).at(-1)).toBe("decision: Berlin");
  });

  it("inserts a question under the title", () => {
    const { editor, app, ctx, el } = setup(MULTI);
    writeProContraField(app, ctx, el, "question", "Where should we work?");
    expect(body(editor).slice(0, 3)).toEqual(["type: procontra", "title: Move?", "question: Where should we work?"]);
  });
});
