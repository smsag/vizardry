import type { App, MarkdownPostProcessorContext } from "obsidian";
import { MarkdownView } from "obsidian";

export const TITLE_MAX_LENGTH = 80;

/**
 * Extracts the `title: ...` line from a canvas source block.
 * Returns the custom title or `fallback` if no title line is present.
 */
export function parseTitle(source: string, fallback: string): string {
  for (const line of source.split("\n")) {
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
  const info = ctx.getSectionInfo(el);
  if (!info) {
    console.warn("Vizardry: writeCanvasTitle — no section info");
    return false;
  }

  const file = app.vault.getFileByPath(ctx.sourcePath);
  if (!file) {
    console.warn(`Vizardry: writeCanvasTitle — file not found: ${ctx.sourcePath}`);
    return false;
  }

  const leaf = app.workspace.getLeavesOfType("markdown").find(
    l => l.view instanceof MarkdownView && l.view.file?.path === ctx.sourcePath
  );
  const editor = leaf?.view instanceof MarkdownView ? leaf.view.editor : undefined;
  if (!editor) {
    console.warn(`Vizardry: writeCanvasTitle — no live editor for ${ctx.sourcePath}`);
    return false;
  }

  const { lineStart, lineEnd } = info;
  const isDefault = newTitle.trim() === defaultTitle.trim();

  // Find existing title line inside the code block
  let titleLine = -1;
  for (let ln = lineStart + 1; ln < lineEnd; ln++) {
    if (editor.getLine(ln).trim().toLowerCase().startsWith("title:")) {
      titleLine = ln;
      break;
    }
  }

  if (isDefault) {
    // Remove the title line if it exists
    if (titleLine !== -1) {
      editor.replaceRange("", { line: titleLine, ch: 0 }, { line: titleLine + 1, ch: 0 });
    }
  } else {
    const titleLineText = `title: ${newTitle.trim().slice(0, TITLE_MAX_LENGTH)}`;
    if (titleLine !== -1) {
      editor.replaceRange(titleLineText, { line: titleLine, ch: 0 }, { line: titleLine, ch: editor.getLine(titleLine).length });
    } else {
      // Insert after the opening fence line
      const afterFence = lineStart + 1;
      editor.replaceRange(titleLineText + "\n", { line: afterFence, ch: 0 });
    }
  }

  return true;
}
