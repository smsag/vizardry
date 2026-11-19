import type { App, MarkdownPostProcessorContext } from "obsidian";
import { resolveEditor } from "./editor";
import { editorWrite } from "./tree-editor-access";
import { indentOf } from "./indent";
import { writeFieldLine } from "./field-line";

export const TITLE_MAX_LENGTH = 80;

/**
 * Extracts the `title: ...` line from a canvas source block.
 * Returns the custom title or `fallback` if no title line is present.
 */
export function parseTitle(source: string, fallback: string): string {
  for (const line of source.split("\n")) {
    // Config lives at indent 0; an indented `title:` is canvas content.
    if (indentOf(line) !== 0) continue;
    const trimmed = line.trim();
    if (trimmed.toLowerCase().startsWith("title:")) {
      const value = trimmed.slice("title:".length).trim();
      if (value) return value.slice(0, TITLE_MAX_LENGTH);
    }
  }
  return fallback;
}

/**
 * Writes (or replaces) the `title: ...` line in the canvas source block.
 * If `newTitle` equals `defaultTitle` the title line is removed entirely
 * so the source stays clean when the user reverts to the default.
 *
 * Returns false if no writable editor could be found.
 */
export function writeCanvasTitle(
  app: App,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  newTitle: string,
  defaultTitle: string,
): boolean {
  const resolved = resolveEditor(app, ctx, el, "writeCanvasTitle");
  if (!resolved) return false;
  const { editor, lineStart, lineEnd } = resolved;
  const isDefault = newTitle.trim() === defaultTitle.trim();

  // First top-level title line (what parseTitle reads); an indented one is content.
  const titleLines: number[] = [];
  for (let ln = lineStart + 1; ln < lineEnd && titleLines.length === 0; ln++) {
    const line = editor.getLine(ln);
    if (indentOf(line) === 0 && line.trim().toLowerCase().startsWith("title:")) titleLines.push(ln);
  }

  const value = isDefault ? "" : newTitle.trim().slice(0, TITLE_MAX_LENGTH);
  editorWrite(() => writeFieldLine(editor, titleLines, "title", value, lineStart), el);

  return true;
}
