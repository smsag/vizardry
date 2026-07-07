import type { App, MarkdownPostProcessorContext } from "obsidian";
import { resolveEditor } from "./editor";
import { findNthKeyedBlock, writeKeyedSubLine } from "./keyed-block-edit";

/**
 * Writes an updated cell value back into the source code block for a
 * SIPOC row-wise diagram.
 *
 * Locates the Nth `row:` block within the code block's line range and
 * either replaces the existing `key: value` line or inserts one if the
 * key was absent (empty cell).
 *
 * Returns false if the editor is unavailable (Read View) or the row
 * cannot be located.
 */
export function writeSIPOCCell(
  app: App,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  rowIndex: number,
  cellKey: string,
  newValue: string,
): boolean {
  const resolved = resolveEditor(app, ctx, el, "writeSIPOCCell");
  if (!resolved) return false;
  const { editor, lineStart, lineEnd } = resolved;

  const row = findNthKeyedBlock(editor, lineStart, lineEnd, t => t === "row:", rowIndex);
  if (!row) {
    console.warn(`Vizardry: writeSIPOCCell — row ${rowIndex} not found`);
    return false;
  }

  writeKeyedSubLine(editor, row, cellKey, newValue);
  return true;
}

/**
 * Inserts a blank `row:` block immediately after the Nth row in the source.
 * If rowIndex is -1, inserts before the first row (prepend).
 *
 * Returns false if the editor is unavailable or the row cannot be located.
 */
export function insertSIPOCRowAfter(
  app: App,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  rowIndex: number,
): boolean {
  const resolved = resolveEditor(app, ctx, el, "insertSIPOCRowAfter");
  if (!resolved) return false;
  const { editor, lineStart, lineEnd } = resolved;

  // Collect start lines of every `row:` block within the code fence
  const rowStarts: number[] = [];
  for (let ln = lineStart; ln <= lineEnd; ln++) {
    if (editor.getLine(ln).trim().toLowerCase() === "row:") {
      rowStarts.push(ln);
    }
  }

  let insertAfterLine: number;

  if (rowIndex < 0 || rowStarts.length === 0) {
    // Insert before first row (or at end of fence if no rows exist)
    insertAfterLine = rowStarts.length > 0 ? rowStarts[0] - 1 : lineEnd - 1;
  } else {
    // End of the Nth row = line before the next row's `row:`, or lineEnd - 1
    const nextRowStart = rowStarts[rowIndex + 1];
    insertAfterLine = nextRowStart !== undefined ? nextRowStart - 1 : lineEnd - 1;

    // Walk back past trailing blank lines so the new row sits flush
    while (insertAfterLine > rowStarts[rowIndex] && editor.getLine(insertAfterLine).trim() === "") {
      insertAfterLine--;
    }
  }

  const lineText = editor.getLine(insertAfterLine);
  editor.replaceRange(
    `\nrow:`,
    { line: insertAfterLine, ch: lineText.length },
  );

  return true;
}
