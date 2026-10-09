/**
 * Stops Obsidian's formatting commands from writing stray markers next to a
 * canvas.
 *
 * In Live Preview a ```vizardry block is one opaque CodeMirror widget. Text
 * selected inside the rendered canvas is a browser selection only: CodeMirror
 * maps it to the widget's edge. Run "Highlight" (or Bold, Italic, a colour
 * from the formatting menu, a paste) and the command acts on that edge, so an
 * empty `==🔴==` lands on the line under the block while the selected canvas
 * text is untouched.
 *
 * The filter drops exactly that shape of edit: while the browser selection
 * sits inside a rendered canvas (not in one of Vizardry's own editors), a
 * change made only of pure insertions at the block's outer edges. Vizardry's
 * own write-back replaces text inside the fences, never inserts on their
 * outside, and a sync or another plugin rewriting the note doesn't hold the
 * selection in a canvas, so neither is affected.
 */
import { EditorState, type ChangeSet, type Extension, type Text } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

const CANVAS_SELECTOR = ".vizardry-canvas";
const EDITABLE_SELECTOR = "input, textarea, [contenteditable]:not([contenteditable='false'])";
const OPEN_FENCE = /^\s*(`{3,}|~{3,})\s*vizardry\b/;

/** Lines scanned upward from the widget for its opening fence. */
const MAX_SCAN_LINES = 5000;

/**
 * The document positions just outside the ```vizardry block that contains or
 * starts at `pos`: before its opening fence, after its closing fence, and the
 * start of the line below. Null when `pos` isn't in such a block.
 */
export function fenceEdges(doc: Text, pos: number): Set<number> | null {
  const startLine = doc.lineAt(Math.max(0, Math.min(pos, doc.length))).number;
  let open = -1;
  let fence = "";
  for (let n = startLine; n >= 1 && startLine - n < MAX_SCAN_LINES; n--) {
    const m = OPEN_FENCE.exec(doc.line(n).text);
    if (m) { open = n; fence = m[1]!; break; }
  }
  if (open < 0) return null;

  const closeRe = new RegExp(`^\\s*${fence[0] === "`" ? "`" : "~"}{${fence.length},}\\s*$`);
  for (let n = open + 1; n <= doc.lines; n++) {
    if (!closeRe.test(doc.line(n).text)) continue;
    if (n < startLine) return null; // that block closed before `pos`
    const closeLine = doc.line(n);
    const edges = new Set([doc.line(open).from, closeLine.to]);
    if (closeLine.to < doc.length) edges.add(closeLine.to + 1);
    return edges;
  }
  return null;
}

/** True when every change in `changes` is a pure insertion at one of `edges`. */
export function onlyInsertsAtEdges(changes: ChangeSet, edges: ReadonlySet<number>): boolean {
  let any = false;
  let ok = true;
  changes.iterChanges((fromA, toA) => {
    any = true;
    if (fromA !== toA || !edges.has(fromA)) ok = false;
  });
  return any && ok;
}

/** The rendered canvas holding the document's current selection, unless the
 *  focus is in one of Vizardry's own editors inside it. */
function selectedCanvas(doc: Document): HTMLElement | null {
  const sel = doc.getSelection();
  const node = sel?.anchorNode;
  if (!node) return null;
  const el = node instanceof Element ? node : node.parentElement;
  const canvas = el?.closest<HTMLElement>(CANVAS_SELECTOR);
  if (!canvas) return null;
  if (el?.closest(EDITABLE_SELECTOR)) return null;
  const active = doc.activeElement;
  if (active && canvas.contains(active) && active.matches(EDITABLE_SELECTOR)) return null;
  return canvas;
}

/**
 * The editor extension. `onBlocked` runs when an edit was dropped (e.g. to
 * explain where canvas text is formatted).
 */
export function canvasFormatGuard(onBlocked: () => void): Extension {
  return EditorState.transactionFilter.of((tr) => {
    if (!tr.docChanged) return tr;
    const doc = typeof activeDocument !== "undefined" ? activeDocument : document;
    const canvas = selectedCanvas(doc);
    if (!canvas) return tr;
    const editorEl = canvas.closest<HTMLElement>(".cm-editor");
    const view = editorEl ? EditorView.findFromDOM(editorEl) : null;
    if (!view || view.state.doc !== tr.startState.doc) return tr;

    let pos: number;
    try {
      pos = view.posAtDOM(canvas);
    } catch {
      return tr;
    }
    const edges = fenceEdges(tr.startState.doc, pos);
    if (!edges || !onlyInsertsAtEdges(tr.changes, edges)) return tr;

    onBlocked();
    return [];
  });
}
