import { describe, it, expect } from "vitest";
import type { Editor } from "obsidian";
import { writeKeyedSubLine } from "./keyed-block-edit";

/** An editor over a real line array, so the write is visible as lines. */
function makeEditor(lines: string[]) {
  const doc = { text: lines.join("\n") };
  const all = () => doc.text.split("\n");
  const offset = (p: { line: number; ch: number }) =>
    all().slice(0, p.line).reduce((n, l) => n + l.length + 1, 0) + p.ch;
  return {
    getLine: (n: number) => all()[n] ?? "",
    replaceRange: (text: string, from: { line: number; ch: number }, to?: { line: number; ch: number }) => {
      const a = offset(from), b = offset(to ?? from);
      doc.text = doc.text.slice(0, a) + text + doc.text.slice(b);
    },
    lines: all,
  };
}

describe("writeKeyedSubLine", () => {
  it("joins a multi-line value onto one line so nothing lands at column 0", () => {
    const editor = makeEditor(["row: Build", "  input: old", "row: Ship"]);
    writeKeyedSubLine(editor as unknown as Editor, { blockLineStart: 0, blockLineEnd: 1 }, "input", "Specs\n  and mocks");
    expect(editor.lines()).toEqual(["row: Build", "  input: Specs and mocks", "row: Ship"]);
  });
});
