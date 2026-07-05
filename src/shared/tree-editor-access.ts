/**
 * Shared helpers for tree canvas edit modules (Mind Map, OST, Impact Map).
 *
 * Each module needs: the live editor reference, the code-block line bounds,
 * and utilities for indent-based source manipulation.
 */

import type { App, Editor, MarkdownPostProcessorContext } from "obsidian";
import { MarkdownView } from "obsidian";
import { ownerWindow } from "./lifecycle";

export interface EditorAccess {
  editor: Editor;
  lineStart: number;
  lineEnd: number;
}

/**
 * Resolves the live editor and the code-block line range for the given
 * element. Returns null when the note is not open in editing mode (Read View).
 */
export function getEditorAccess(
  app: App,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  callerName: string,
): EditorAccess | null {
  const info = ctx.getSectionInfo(el);
  if (!info) {
    console.warn(`Vizardry: ${callerName} — no section info`);
    return null;
  }

  const file = app.vault.getFileByPath(ctx.sourcePath);
  if (!file) {
    console.warn(`Vizardry: ${callerName} — file not found: ${ctx.sourcePath}`);
    return null;
  }

  const leaf = app.workspace.getLeavesOfType("markdown").find(
    l => l.view instanceof MarkdownView && l.view.file?.path === ctx.sourcePath
  );
  const editor = leaf?.view instanceof MarkdownView ? leaf.view.editor : undefined;
  if (!editor) {
    console.warn(`Vizardry: ${callerName} — no live editor (open the note in editing mode)`);
    return null;
  }

  return { editor, lineStart: info.lineStart, lineEnd: info.lineEnd };
}

/**
 * Returns the number of leading spaces on the first indented line in the
 * block. Falls back to 2 if no indented line is found.
 */
export function detectIndentUnit(editor: Editor, lineStart: number, lineEnd: number): number {
  for (let ln = lineStart + 1; ln <= lineEnd; ln++) {
    const raw = editor.getLine(ln);
    if (raw.trim() === "" || raw.trim().startsWith("//") || raw.trim().startsWith("```")) continue;
    const indent = raw.search(/\S/);
    if (indent > 0) return indent;
  }
  return 2;
}

/**
 * Returns the last line of the subtree rooted at `parentLine`.
 * A line belongs to the subtree if it is strictly more indented than
 * `parentIndent` (blank lines and comments are skipped).
 */
export function subtreeEnd(
  editor: Editor,
  parentLine: number,
  parentIndent: number,
  lineEnd: number,
): number {
  let last = parentLine;
  for (let ln = parentLine + 1; ln <= lineEnd; ln++) {
    const raw = editor.getLine(ln);
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed.startsWith("//")) { last = ln; continue; }
    if (trimmed.startsWith("```")) break; // closing fence
    const indent = raw.search(/\S/);
    if (indent <= parentIndent) break;
    last = ln;
  }
  return last;
}

/**
 * Wraps a synchronous `editor.replaceRange` call so the viewport does not
 * scroll away from the canvas.
 *
 * CodeMirror 6 appends a `scrollIntoView` effect to every transaction that
 * moves the cursor. In Obsidian's Live Preview the editor and the rendered
 * view share a single scroll container (`.cm-scroller`), so that effect can
 * jump the page to show the source-code line that was just edited — which is
 * hidden behind the rendered canvas. We snapshot the scroll offset before the
 * write and restore it on the next animation frame, after CM6 has applied its
 * own scroll effect.
 */
export function editorWrite(fn: () => void, el: HTMLElement): void {
  const scroller = el.closest<HTMLElement>(".cm-scroller");
  const saved = scroller?.scrollTop;
  fn();
  if (scroller !== null && saved !== undefined) {
    ownerWindow(el).requestAnimationFrame(() => { scroller.scrollTop = saved; });
  }
}

/**
 * Deletes lines [fromLine, toLine] inclusive and any immediately following
 * blank lines (so no orphaned blank line remains).
 */
export function deleteLines(editor: Editor, fromLine: number, toLine: number, el: HTMLElement): void {
  editorWrite(() => {
    editor.replaceRange("", { line: fromLine, ch: 0 }, { line: toLine + 1, ch: 0 });
  }, el);
}
