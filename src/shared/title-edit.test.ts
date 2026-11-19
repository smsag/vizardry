// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { MarkdownView } from "obsidian";
import { writeCanvasTitle } from "./title-edit";

function setup(lines: string[]) {
  const doc = { text: lines.join("\n") };
  const all = () => doc.text.split("\n");
  const offset = (p: { line: number; ch: number }) =>
    all().slice(0, p.line).reduce((n, l) => n + l.length + 1, 0) + p.ch;
  const editor = {
    getLine: (n: number) => all()[n] ?? "",
    lineCount: () => all().length,
    replaceRange: (text: string, from: { line: number; ch: number }, to?: { line: number; ch: number }) => {
      const a = offset(from), b = offset(to ?? from);
      doc.text = doc.text.slice(0, a) + text + doc.text.slice(b);
    },
  };
  const view = Object.create(MarkdownView.prototype);
  view.file = { path: "n.md" };
  view.editor = editor;
  const app = {
    vault: { getFileByPath: (p: string) => (p === "n.md" ? { path: p } : null) },
    workspace: { getLeavesOfType: () => [{ view }] },
  } as never;
  const ctx = { sourcePath: "n.md", getSectionInfo: () => ({ lineStart: 0, lineEnd: all().length - 1, text: "" }) } as never;
  return { app, ctx, lines: all };
}

describe("writeCanvasTitle", () => {
  it("leaves an indented `Title:` body line alone and inserts a top-level title", () => {
    const { app, ctx, lines } = setup(["```vizardry", "block: Team", "  Title: Senior PM is vacant", "```"]);
    expect(writeCanvasTitle(app, ctx, document.createElement("div"), "Org", "Default")).toBe(true);
    expect(lines()).toEqual(["```vizardry", "title: Org", "block: Team", "  Title: Senior PM is vacant", "```"]);
  });
});
