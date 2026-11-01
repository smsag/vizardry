import type { App, MarkdownPostProcessorContext } from "obsidian";
import { MarkdownView } from "obsidian";
import { findCodeFenceBySource, lineOfElement, linesOf, resolveEditor } from "./editor";
import type { LineSource } from "./editor";
import { editorWrite } from "./tree-editor-access";

/**
 * Source write-back for the Scribble canvas. A save rewrites the block's
 * stroke lines (`stroke:` and `highlight:`), `id:`, `height:` and
 * `background:` together in one replaceRange over the fence body: one write
 * is one undo step in the editor, and the lines can't drift apart between
 * several smaller writes.
 *
 * While the note is open the write goes through its editor. Once no view
 * holds the note (it was closed, or its tab moved to another note) the block
 * is rewritten in the file instead, so strokes still pending at that moment
 * are not lost.
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

/**
 * The key of a `key: value` line, at any indentation — the parser reads
 * indented scribble lines too, so the writer must recognise (and normalise)
 * them, or an indented stroke would be kept and written again on every save.
 */
function lineKey(line: string): string | null {
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
    const key = lineKey(line);
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
      const at = out.findIndex(l => lineKey(l) === anchor) + 1;
      out.splice(at, 0, `${key}: ${value}`);
      if (strokeAt >= at) strokeAt++;
    }
    if (value !== null && out.some(l => lineKey(l) === key)) anchor = key;
  }

  if (strokeAt === -1) {
    strokeAt = out.length;
    while (strokeAt > 0 && out[strokeAt - 1].trim() === "") strokeAt--;
  }
  out.splice(strokeAt, 0, ...update.strokeLines);
  return out;
}

/** The markdown views currently holding `path`. */
function viewsOf(app: App, path: string): MarkdownView[] {
  return app.workspace.getLeavesOfType("markdown")
    .map(l => l.view)
    .filter((v): v is MarkdownView => v instanceof MarkdownView && v.file?.path === path);
}

/** True while some open view holds the note — writes must then go through its editor. */
export function isNoteOpen(app: App, path: string): boolean {
  return viewsOf(app, path).length > 0;
}

/**
 * Asks every view holding the note to write its editor to disk now, instead
 * of on Obsidian's own debounce — for the moment the app is backgrounded,
 * when iOS may suspend it before that debounce fires.
 */
export function saveNoteNow(app: App, path: string): void {
  for (const view of viewsOf(app, path)) {
    view.save().catch((err: unknown) => console.error("Vizardry: could not save the note", err));
  }
}

/**
 * Writes the update into the code block through the note's editor. Returns
 * the new block source — the caller stores it as the canvas's `vzSource`, so
 * a second save before Obsidian has re-rendered the block still finds it — or
 * null when no editable editor holds the block.
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
  const text = rewriteScribbleBody(body, update).join("\n");
  if (text !== body.join("\n")) {
    editorWrite(() => {
      editor.replaceRange(text, { line: first, ch: 0 }, { line: last, ch: editor.getLine(last).length });
    }, el);
  }
  return text;
}

/**
 * Writes the update into the code block in the file itself, for when no view
 * holds the note any more. `source` is the block body as last rendered or
 * written, used to find the fence. Resolves to the new block source, or null
 * when the file or the block is gone.
 */
export async function writeScribbleToFile(
  app: App,
  ctx: MarkdownPostProcessorContext,
  source: string,
  update: ScribbleUpdate,
): Promise<string | null> {
  const file = app.vault.getFileByPath(ctx.sourcePath);
  if (!file) return null;
  let written: string | null = null;
  await app.vault.process(file, (content) => {
    const doc = linesOf(content);
    const range = findCodeFenceBySource(doc, source);
    if (!range || range.lineEnd - 1 < range.lineStart + 1) {
      console.warn("Vizardry: writeScribbleToFile — no matching code fence in the file");
      return content;
    }
    const body = doc.lines.slice(range.lineStart + 1, range.lineEnd);
    const next = rewriteScribbleBody(body, update);
    written = next.join("\n");
    return [...doc.lines.slice(0, range.lineStart + 1), ...next, ...doc.lines.slice(range.lineEnd)].join("\n");
  });
  return written;
}

interface ScribbleFence {
  lineStart: number;
  lineEnd: number;
  /** The block's `id:` value, or null when it has none yet. */
  id: string | null;
  body: string;
}

/** Every ```vizardry fence whose `type:` is scribble, in document order. */
function scribbleFences(doc: LineSource): ScribbleFence[] {
  const fences: ScribbleFence[] = [];
  const count = doc.lineCount();
  for (let i = 0; i < count; i++) {
    const open = doc.getLine(i).trim().match(/^(`{3,})vizardry\s*$/i);
    if (!open) continue;
    const closeRe = new RegExp(`^\`{${open[1].length},}\\s*$`);
    const body: string[] = [];
    let j = i + 1;
    for (; j < count && !closeRe.test(doc.getLine(j).trim()); j++) body.push(doc.getLine(j));
    if (body.some(l => lineKey(l) === "type" && /^type:\s*scribble\b/i.test(l.trim()))) {
      const idLine = body.find(l => lineKey(l) === "id");
      fences.push({ lineStart: i, lineEnd: j, id: idLine ? idLine.trim().slice(3).trim() : null, body: body.join("\n") });
    }
    i = j;
  }
  return fences;
}

/**
 * True when the scribble rendered in `el` is a later copy of another block in
 * the same note — the same `id:`, or, for a block without one yet, the same
 * content. A copied block must take a new id: the session store is keyed by
 * id, and two live blocks sharing one session write each other's strokes.
 * The first block in the note keeps the id. False whenever this can't be
 * decided (no open editor, the canvas not yet in the editor's DOM).
 */
export function isLaterDuplicate(
  app: App,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  id: string | null,
  source: string,
): boolean {
  const views = viewsOf(app, ctx.sourcePath);
  const view = views.find(v => v.containerEl.contains(el)) ?? views[0];
  if (!view) return false;
  const here = lineOfElement(view.editor, el);
  if (here === null) return false;
  const fences = scribbleFences(view.editor);
  const mine = fences.find(f => f.lineStart <= here && here <= f.lineEnd);
  const claims = (f: ScribbleFence): boolean => id !== null ? f.id === id : f.id === null && f.body.trim() === source.trim();
  if (!mine || !claims(mine)) return false;
  return fences.find(claims) !== mine;
}
