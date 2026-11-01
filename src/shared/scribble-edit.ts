import type { App, MarkdownPostProcessorContext } from "obsidian";
import { resolveEditor } from "./editor";
import { editorWrite } from "./tree-editor-access";
import { indentOf } from "./indent";

/**
 * Source write-back for the Scribble canvas. A save rewrites the block's
 * stroke lines (`stroke:` and `highlight:`), `id:`, `height:` and
 * `background:` together in one replaceRange over the fence body: one write
 * is one undo step in the editor, and the lines can't drift apart between
 * several smaller writes.
 */

export interface ScribbleUpdate {
  id: string;
  height: number;
  /** null removes the line (the default, blank paper). */
  background: string | null;
  /** Complete stroke lines, in drawing order. */
  strokeLines: string[];
}

const STROKE_LINE_KEYS = new Set(["stroke", "highlight"]);

function topLevelKey(line: string): string | null {
  if (indentOf(line) !== 0) return null;
  const trimmed = line.trim();
  const colon = trimmed.indexOf(":");
  return colon === -1 ? null : trimmed.slice(0, colon).trim().toLowerCase();
}

/**
 * The block body with the update applied. Other lines keep their place. The
 * strokes go where the first stroke line was (or after the last content line
 * when there were none). Each config field replaces its first line (later
 * duplicates are dropped); a missing one is inserted after `type:` or the
 * field before it, so a fresh block reads type → id → height → background.
 */
export function rewriteScribbleBody(body: string[], update: ScribbleUpdate): string[] {
  const fields: [key: string, value: string | null][] = [
    ["id", update.id],
    ["height", String(update.height)],
    ["background", update.background],
  ];
  const values = new Map(fields);
  const written = new Set<string>();
  const out: string[] = [];
  let strokeAt = -1;

  for (const line of body) {
    const key = topLevelKey(line);
    if (key !== null && STROKE_LINE_KEYS.has(key)) {
      if (strokeAt === -1) strokeAt = out.length;
      continue;
    }
    if (key !== null && values.has(key)) {
      const value = values.get(key);
      if (!written.has(key) && value !== null && value !== undefined) out.push(`${key}: ${value}`);
      written.add(key);
      continue;
    }
    out.push(line);
  }

  let anchor = "type";
  for (const [key, value] of fields) {
    if (!written.has(key) && value !== null) {
      const at = out.findIndex(l => topLevelKey(l) === anchor) + 1;
      out.splice(at, 0, `${key}: ${value}`);
      if (strokeAt >= at) strokeAt++;
    }
    if (value !== null && out.some(l => topLevelKey(l) === key)) anchor = key;
  }

  if (strokeAt === -1) {
    strokeAt = out.length;
    while (strokeAt > 0 && out[strokeAt - 1].trim() === "") strokeAt--;
  }
  out.splice(strokeAt, 0, ...update.strokeLines);
  return out;
}

/**
 * Writes the update into the code block. Returns the new block source — the
 * caller stores it as the canvas's `vzSource`, so a second save before
 * Obsidian has re-rendered the block still finds it — or null when no
 * editable editor holds the block (Reading View, note closed).
 */
export function writeScribble(
  app: App,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  update: ScribbleUpdate,
): string | null {
  const resolved = resolveEditor(app, ctx, el, "writeScribble");
  if (!resolved) return null;
  const { editor, lineStart, lineEnd } = resolved;
  const first = lineStart + 1;
  const last = lineEnd - 1;
  if (last < first) {
    console.warn("Vizardry: writeScribble — the block has no body to write into");
    return null;
  }

  const body: string[] = [];
  for (let ln = first; ln <= last; ln++) body.push(editor.getLine(ln));
  const next = rewriteScribbleBody(body, update);
  const text = next.join("\n");
  if (text !== body.join("\n")) {
    editorWrite(() => {
      editor.replaceRange(text, { line: first, ch: 0 }, { line: last, ch: editor.getLine(last).length });
    }, el);
  }
  return text;
}
