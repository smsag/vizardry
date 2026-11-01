import type { App, MarkdownPostProcessorContext } from "obsidian";
import { resolveEditor } from "./editor";
import { editorWrite } from "./tree-editor-access";
import { indentOf } from "./indent";

/**
 * Source write-back for the Scribble canvas. A save rewrites the block's
 * `stroke:` lines, `id:` and `height:` together in one replaceRange over the
 * fence body: one write is one undo step in the editor, and the lines can't
 * drift apart between several smaller writes.
 */

export interface ScribbleUpdate {
  id: string;
  height: number;
  /** Complete `stroke: …` lines, in drawing order. */
  strokeLines: string[];
}

function topLevelKey(line: string): string | null {
  if (indentOf(line) !== 0) return null;
  const trimmed = line.trim();
  const colon = trimmed.indexOf(":");
  return colon === -1 ? null : trimmed.slice(0, colon).trim().toLowerCase();
}

/**
 * The block body with the update applied. Other lines keep their place. The
 * strokes go where the first stroke line was (or after the last content line
 * when there were none); a missing `id:` goes right after `type:`, and a
 * missing `height:` right after the `id:`.
 */
export function rewriteScribbleBody(body: string[], update: ScribbleUpdate): string[] {
  const out: string[] = [];
  let strokeAt = -1;
  let hasId = false;
  let hasHeight = false;
  for (const line of body) {
    const key = topLevelKey(line);
    if (key === "stroke") {
      if (strokeAt === -1) strokeAt = out.length;
      continue;
    }
    if (key === "id") {
      if (!hasId) out.push(`id: ${update.id}`);
      hasId = true;
      continue;
    }
    if (key === "height") {
      if (!hasHeight) out.push(`height: ${update.height}`);
      hasHeight = true;
      continue;
    }
    out.push(line);
  }

  let headerEnd = out.findIndex(l => topLevelKey(l) === "type") + 1;
  if (!hasId) {
    out.splice(headerEnd, 0, `id: ${update.id}`);
    if (strokeAt >= headerEnd) strokeAt++;
  }
  if (!hasHeight) {
    headerEnd = out.findIndex(l => topLevelKey(l) === "id") + 1;
    out.splice(headerEnd, 0, `height: ${update.height}`);
    if (strokeAt >= headerEnd) strokeAt++;
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
