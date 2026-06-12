import type { App, Editor, MarkdownPostProcessorContext } from "obsidian";
import { MarkdownView } from "obsidian";

export type ResolvedEditor = {
  editor: MarkdownView["editor"];
  lineStart: number;
  lineEnd: number;
};

/**
 * Resolves the live CodeMirror editor for the note containing `el`.
 * Returns null when the editor is unavailable — most commonly Reading View.
 */
export function resolveEditor(
  app: App,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  caller: string,
): ResolvedEditor | null {
  const info = ctx.getSectionInfo(el);
  if (!info) {
    console.warn(`Vizardry: ${caller} — no section info`);
    return null;
  }
  const file = app.vault.getFileByPath(ctx.sourcePath);
  if (!file) {
    console.warn(`Vizardry: ${caller} — file not found: ${ctx.sourcePath}`);
    return null;
  }
  const leaf = app.workspace.getLeavesOfType("markdown").find(
    l => l.view instanceof MarkdownView && l.view.file?.path === ctx.sourcePath,
  );
  const editor = leaf?.view instanceof MarkdownView ? leaf.view.editor : undefined;
  if (!editor) {
    console.warn(`Vizardry: ${caller} — no live editor`);
    return null;
  }
  return { editor, lineStart: info.lineStart, lineEnd: info.lineEnd };
}

export function insertTemplateAtCursor(editor: Editor, template: string): void {
  const cursor = editor.getCursor();
  const lineText = editor.getLine(cursor.line);
  const onBlankLine = lineText.trim() === "";
  const from = onBlankLine
    ? { line: cursor.line, ch: 0 }
    : { line: cursor.line, ch: lineText.length };
  editor.replaceRange(onBlankLine ? template : "\n" + template, from);
  const firstKeyLine = cursor.line + (onBlankLine ? 1 : 2);
  const firstKeyText = editor.getLine(firstKeyLine);
  editor.setCursor({ line: firstKeyLine, ch: firstKeyText.length });
}
