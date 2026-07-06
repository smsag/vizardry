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
 *
 * ctx.getSectionInfo() returns null in Obsidian's Live Preview / source mode,
 * so we fall back to scanning the editor content for the code fence whose
 * body matches the source stored on the container's dataset.vzSource.
 */
export function resolveEditor(
  app: App,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  caller: string,
): ResolvedEditor | null {
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

  // Primary path: section info from the post-processor context (works in Read Mode).
  const info = ctx.getSectionInfo(el);
  if (info) {
    return { editor, lineStart: info.lineStart, lineEnd: info.lineEnd };
  }

  // Fallback: scan editor lines for the code fence containing this block.
  // Needed in Live Preview / source mode where getSectionInfo returns null.
  const source = el.dataset.vzSource;
  if (source) {
    const range = findCodeFenceBySource(editor, source);
    if (range) return { editor, ...range };
    console.warn(`Vizardry: ${caller} — source scan found no matching code fence`);
    return null;
  }

  console.warn(`Vizardry: ${caller} — no section info and no vzSource fallback`);
  return null;
}

/**
 * Scans the editor for a code fence whose trimmed body matches source.
 * Returns the lineStart (opening ```) and lineEnd (closing ```) line indices.
 */
function findCodeFenceBySource(
  editor: MarkdownView["editor"],
  source: string,
): { lineStart: number; lineEnd: number } | null {
  const lineCount = editor.lineCount();
  const normalised = source.trim();

  const matches: { lineStart: number; lineEnd: number }[] = [];
  for (let i = 0; i < lineCount; i++) {
    const line = editor.getLine(i).trim();
    if (!line.startsWith("```")) continue;

    const fenceStart = i;
    let body = "";
    let j = i + 1;
    for (; j < lineCount; j++) {
      const inner = editor.getLine(j);
      if (inner.trim() === "```") break;
      body += (body ? "\n" : "") + inner;
    }
    if (body.trim() === normalised) matches.push({ lineStart: fenceStart, lineEnd: j });
    i = j;
  }

  if (matches.length === 0) return null;
  if (matches.length > 1) {
    // Two canvases with byte-identical source can't be told apart by a content
    // scan — we edit the first, but surface the ambiguity so it's diagnosable.
    console.warn(`Vizardry: ${matches.length} code fences share identical source; editing the first — give the canvases distinct content to disambiguate`);
  }
  return matches[0];
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
