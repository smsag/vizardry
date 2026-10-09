import { describe, it, expect } from "vitest";
import { ChangeSet, Text } from "@codemirror/state";
import { fenceEdges, onlyInsertsAtEdges } from "./canvas-format-guard";

const NOTE = [
  "# Note",                 // 1
  "",                       // 2
  "```vizardry",            // 3
  "type: mindmap",          // 4
  "- Central Topic",        // 5
  "```",                    // 6
  "",                       // 7
  "After",                  // 8
].join("\n");
const doc = Text.of(NOTE.split("\n"));
const open = doc.line(3).from;
const closeEnd = doc.line(6).to;

describe("fenceEdges", () => {
  it("returns the outer edges of the block the widget starts at", () => {
    expect(fenceEdges(doc, open)).toEqual(new Set([open, closeEnd, closeEnd + 1]));
  });

  it("finds the block from a position inside it", () => {
    expect(fenceEdges(doc, doc.line(5).from + 3)).toEqual(new Set([open, closeEnd, closeEnd + 1]));
  });

  it("returns null outside any vizardry block", () => {
    expect(fenceEdges(doc, doc.line(8).from)).toBeNull();
    expect(fenceEdges(doc, 0)).toBeNull();
  });

  it("ignores other code blocks", () => {
    const other = Text.of(["```js", "x", "```"]);
    expect(fenceEdges(other, 2)).toBeNull();
  });

  it("matches a longer opening fence only with a long enough closer", () => {
    const d = Text.of(["````vizardry", "type: bmc", "```", "````"]);
    expect(fenceEdges(d, 0)).toEqual(new Set([0, d.line(4).to]));
  });

  it("returns null for an unclosed block", () => {
    expect(fenceEdges(Text.of(["```vizardry", "type: bmc"]), 0)).toBeNull();
  });
});

describe("onlyInsertsAtEdges", () => {
  const edges = fenceEdges(doc, open)!;
  const insert = (from: number, text: string): ChangeSet => ChangeSet.of({ from, insert: text }, doc.length);

  it("flags an empty highlight inserted under the block", () => {
    expect(onlyInsertsAtEdges(insert(closeEnd + 1, "==🔴=="), edges)).toBe(true);
    expect(onlyInsertsAtEdges(insert(closeEnd, "===="), edges)).toBe(true);
  });

  it("flags markers wrapped around the whole block", () => {
    const wrap = ChangeSet.of([{ from: open, insert: "==" }, { from: closeEnd, insert: "==" }], doc.length);
    expect(onlyInsertsAtEdges(wrap, edges)).toBe(true);
  });

  it("lets Vizardry's own write-back inside the fences through", () => {
    const write = ChangeSet.of({ from: doc.line(5).from, to: doc.line(5).to, insert: "- ==Central== Topic" }, doc.length);
    expect(onlyInsertsAtEdges(write, edges)).toBe(false);
    expect(onlyInsertsAtEdges(insert(doc.line(6).from, "- New\n"), edges)).toBe(false);
  });

  it("lets edits elsewhere in the note through", () => {
    expect(onlyInsertsAtEdges(insert(doc.line(8).to, "!"), edges)).toBe(false);
  });

  it("lets a deletion at an edge through", () => {
    const del = ChangeSet.of({ from: closeEnd, to: closeEnd + 1 }, doc.length);
    expect(onlyInsertsAtEdges(del, edges)).toBe(false);
  });

  it("is false for an empty change set", () => {
    expect(onlyInsertsAtEdges(ChangeSet.empty(doc.length), edges)).toBe(false);
  });
});
