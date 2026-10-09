// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { ChangeSet, StateField, Text, type Extension } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, type DecorationSet } from "@codemirror/view";
import { canvasFormatGuard, fenceEdges, isStrayFormatting, selectedCanvas } from "./canvas-format-guard";

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

  it("finds a block inside a callout and adds the callout's own edges", () => {
    const d = Text.of(["Intro", "> [!note] Map", "> ```vizardry", "> type: mindmap", "> ```", "> after", "", "Tail"]);
    const edges = fenceEdges(d, d.line(3).from)!;
    expect(edges).not.toBeNull();
    // The fence's own edges…
    expect(edges.has(d.line(3).from)).toBe(true);
    expect(edges.has(d.line(5).to)).toBe(true);
    // …and the whole callout's (line 2 through line 6).
    expect(edges.has(d.line(2).from)).toBe(true);
    expect(edges.has(d.line(6).to)).toBe(true);
    expect(edges.has(d.line(6).to + 1)).toBe(true);
  });
});

describe("isStrayFormatting", () => {
  const edges = fenceEdges(doc, open)!;
  const insert = (from: number, text: string): ChangeSet => ChangeSet.of({ from, insert: text }, doc.length);

  it("flags an empty highlight inserted under the block", () => {
    expect(isStrayFormatting(insert(closeEnd + 1, "==🔴=="), edges)).toBe(true);
    expect(isStrayFormatting(insert(closeEnd, "===="), edges)).toBe(true);
    expect(isStrayFormatting(insert(closeEnd, "****"), edges)).toBe(true);
  });

  it("flags markers wrapped around the whole block", () => {
    const wrap = ChangeSet.of([{ from: open, insert: "==" }, { from: closeEnd, insert: "==" }], doc.length);
    expect(isStrayFormatting(wrap, edges)).toBe(true);
  });

  it("lets Vizardry's own write-back inside the fences through", () => {
    const write = ChangeSet.of({ from: doc.line(5).from, to: doc.line(5).to, insert: "- ==Central== Topic" }, doc.length);
    expect(isStrayFormatting(write, edges)).toBe(false);
    expect(isStrayFormatting(insert(doc.line(6).from, "- New\n"), edges)).toBe(false);
  });

  it("lets a template inserted right after the block through", () => {
    expect(isStrayFormatting(insert(closeEnd, "\n```vizardry\ntype: swot\n```\n"), edges)).toBe(false);
  });

  it("lets a synced line added under the block through", () => {
    expect(isStrayFormatting(insert(closeEnd + 1, "A new paragraph\n"), edges)).toBe(false);
  });

  it("lets edits elsewhere in the note through", () => {
    expect(isStrayFormatting(insert(doc.line(8).to, "=="), edges)).toBe(false);
  });

  it("lets a deletion at an edge through", () => {
    const del = ChangeSet.of({ from: closeEnd, to: closeEnd + 1 }, doc.length);
    expect(isStrayFormatting(del, edges)).toBe(false);
  });

  it("is false for an empty change set", () => {
    expect(isStrayFormatting(ChangeSet.empty(doc.length), edges)).toBe(false);
  });
});

/** Mimics Obsidian's Live Preview: the fenced block replaced by a widget that
 *  holds a rendered canvas, inside CodeMirror's contenteditable content. */
class CanvasWidget extends WidgetType {
  override toDOM(): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "block-language-vizardry";
    const canvas = wrap.appendChild(document.createElement("div"));
    canvas.className = "vizardry-canvas";
    const label = canvas.appendChild(document.createElement("span"));
    label.className = "label";
    label.textContent = "Central Topic";
    const editor = canvas.appendChild(document.createElement("span"));
    editor.className = "own-editor";
    editor.setAttribute("contenteditable", "plaintext-only");
    editor.textContent = "Rename me";
    return wrap;
  }
  override ignoreEvent(): boolean { return true; }
}

const canvasWidget: Extension = StateField.define<DecorationSet>({
  create: (state) => {
    const from = state.doc.line(3).from;
    const to = state.doc.line(6).to;
    return Decoration.set([Decoration.replace({ widget: new CanvasWidget(), block: true }).range(from, to)]);
  },
  update: (deco, tr) => deco.map(tr.changes),
  provide: (f) => EditorView.decorations.from(f),
});

function mountEditor(onBlocked: () => void): EditorView {
  const parent = document.body.appendChild(document.createElement("div"));
  return new EditorView({ doc: NOTE, extensions: [canvasWidget, canvasFormatGuard(onBlocked)], parent });
}

function selectText(el: Element): void {
  const range = document.createRange();
  range.selectNodeContents(el.firstChild!);
  const sel = document.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);
}

describe("selectedCanvas", () => {
  afterEach(() => { document.body.innerHTML = ""; document.getSelection()?.removeAllRanges(); });

  it("finds the canvas although it sits inside CodeMirror's contenteditable content", () => {
    const view = mountEditor(() => {});
    const label = view.dom.querySelector(".vizardry-canvas .label")!;
    expect(view.contentDOM.getAttribute("contenteditable")).toBe("true");
    selectText(label);
    expect(selectedCanvas(document)).toBe(view.dom.querySelector(".vizardry-canvas"));
  });

  it("ignores a selection in one of Vizardry's own editors", () => {
    const view = mountEditor(() => {});
    selectText(view.dom.querySelector(".own-editor")!);
    expect(selectedCanvas(document)).toBeNull();
  });

  it("ignores a selection outside any canvas", () => {
    const outside = document.body.appendChild(document.createElement("p"));
    outside.textContent = "text";
    selectText(outside);
    expect(selectedCanvas(document)).toBeNull();
  });
});

describe("canvasFormatGuard (end to end)", () => {
  afterEach(() => { document.body.innerHTML = ""; document.getSelection()?.removeAllRanges(); });

  it("drops an empty highlight inserted under the block while canvas text is selected", () => {
    const onBlocked = vi.fn();
    const view = mountEditor(onBlocked);
    selectText(view.dom.querySelector(".vizardry-canvas .label")!);
    view.dispatch({ changes: { from: closeEnd + 1, insert: "==🔴==" } });
    expect(view.state.doc.toString()).toBe(NOTE);
    expect(onBlocked).toHaveBeenCalledTimes(1);
  });

  it("lets a template insert after the block through", () => {
    const onBlocked = vi.fn();
    const view = mountEditor(onBlocked);
    selectText(view.dom.querySelector(".vizardry-canvas .label")!);
    view.dispatch({ changes: { from: closeEnd, insert: "\n```vizardry\ntype: swot\n```" } });
    expect(view.state.doc.toString()).not.toBe(NOTE);
    expect(onBlocked).not.toHaveBeenCalled();
  });

  it("does nothing while the selection is outside the canvas", () => {
    const onBlocked = vi.fn();
    const view = mountEditor(onBlocked);
    view.dispatch({ changes: { from: closeEnd + 1, insert: "====" } });
    expect(view.state.doc.toString()).not.toBe(NOTE);
    expect(onBlocked).not.toHaveBeenCalled();
  });
});
