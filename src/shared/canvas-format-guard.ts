/**
 * Stops Obsidian's formatting commands from writing stray markers next to a
 * canvas.
 *
 * In Live Preview a ```vizardry block is one opaque CodeMirror widget. Text
 * selected inside the rendered canvas is a browser selection only: CodeMirror
 * maps it to the widget's edge. Run "Highlight" (or Bold, Italic, a colour
 * from the formatting menu) and the command acts on that edge, so an empty
 * `==🔴==` lands on the line under the block while the selected canvas text
 * is untouched.
 *
 * The filter drops exactly that shape of edit, and only when all three hold:
 *   - the browser selection sits inside a rendered canvas, not in one of
 *     Vizardry's own editors there;
 *   - every change is a pure insertion at the block's outer edges (or, for a
 *     block inside a callout or quote, that callout's edges);
 *   - every inserted piece is formatting markers only (`==`, `**`, `~~`,
 *     backticks, `%%`, `$`, optionally a highlight-colour emoji).
 * Vizardry's own write-back replaces text inside the fences, a template
 * insert or a synced edit carries real text, so none of them match.
 */
import { EditorState, type ChangeSet, type Extension, type Text } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

const CANVAS_SELECTOR = ".vizardry-canvas";
const EDITABLE_SELECTOR = "input, textarea, [contenteditable]:not([contenteditable='false'])";
// Leading `>` markers: a block inside a callout or blockquote.
const QUOTE_PREFIX = String.raw`^\s*(?:>\s*)*`;
const OPEN_FENCE = new RegExp(String.raw`${QUOTE_PREFIX}(\`{3,}|~{3,})\s*vizardry\b`);
const QUOTED = /^\s*>/;
// What a formatting command inserts: markers, maybe a highlight-colour emoji.
const MARKERS_ONLY = /^[=*_~`$%]*(?:(?:\u{1F534}|\u{1F7E0}|\u{1F7E1}|\u{1F7E2}|\u{1F535}|\u{1F7E3})\uFE0F?)?[=*_~`$%]*$/u;

/** Lines scanned upward from the widget for its opening fence. */
const MAX_SCAN_LINES = 5000;

/**
 * The document positions just outside the ```vizardry block that contains or
 * starts at `pos`: before its opening fence, after its closing fence, and the
 * start of the line below. For a block inside a callout or blockquote, the
 * same three positions around the whole quote are added: Live Preview renders
 * the callout as one widget, so a command lands on its edges instead. Null
 * when `pos` isn't in such a block.
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

  const closeRe = new RegExp(`${QUOTE_PREFIX}${fence[0] === "`" ? "`" : "~"}{${fence.length},}\\s*$`);
  for (let n = open + 1; n <= doc.lines; n++) {
    if (!closeRe.test(doc.line(n).text)) continue;
    if (n < startLine) return null; // that block closed before `pos`
    const edges = new Set<number>();
    const addAround = (first: number, last: number): void => {
      const lastLine = doc.line(last);
      edges.add(doc.line(first).from);
      edges.add(lastLine.to);
      if (lastLine.to < doc.length) edges.add(lastLine.to + 1);
    };
    addAround(open, n);
    if (QUOTED.test(doc.line(open).text)) {
      let top = open;
      while (top > 1 && QUOTED.test(doc.line(top - 1).text)) top--;
      let bottom = n;
      while (bottom < doc.lines && QUOTED.test(doc.line(bottom + 1).text)) bottom++;
      addAround(top, bottom);
    }
    return edges;
  }
  return null;
}

/** True when every change in `changes` is a pure insertion at one of
 *  `edges` of formatting markers only: the shape of an Obsidian formatting
 *  command run on a selection CodeMirror can't see. */
export function isStrayFormatting(changes: ChangeSet, edges: ReadonlySet<number>): boolean {
  let any = false;
  let ok = true;
  changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
    any = true;
    const text = inserted.toString();
    if (fromA !== toA || !edges.has(fromA) || !text || !MARKERS_ONLY.test(text)) ok = false;
  });
  return any && ok;
}

/** The rendered canvas holding the document's current selection, unless the
 *  selection or focus is in one of Vizardry's own editors inside it. Only
 *  editors inside the canvas count: in Live Preview the whole canvas sits
 *  inside CodeMirror's own contenteditable `.cm-content`. */
export function selectedCanvas(doc: Document): HTMLElement | null {
  const sel = doc.getSelection();
  const node = sel?.anchorNode;
  if (!node) return null;
  const el = node instanceof Element ? node : node.parentElement;
  const canvas = el?.closest<HTMLElement>(CANVAS_SELECTOR);
  if (!canvas) return null;
  const editable = el?.closest(EDITABLE_SELECTOR);
  if (editable && canvas.contains(editable)) return null;
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
    if (!edges || !isStrayFormatting(tr.changes, edges)) return tr;

    onBlocked();
    return [];
  });
}
