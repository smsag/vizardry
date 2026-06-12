import type { App, MarkdownPostProcessorContext } from "obsidian";
import { resolveEditor } from "./editor";

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

  // Locate the Nth `row:` block
  let rowCount = -1;
  let rowLineStart = -1;
  let rowLineEnd = lineEnd;

  for (let ln = lineStart; ln <= lineEnd; ln++) {
    const trimmed = editor.getLine(ln).trim().toLowerCase();
    if (trimmed === "row:") {
      rowCount++;
      if (rowCount === rowIndex) {
        rowLineStart = ln;
      } else if (rowCount > rowIndex) {
        rowLineEnd = ln - 1;
        break;
      }
    }
  }

  if (rowLineStart === -1) {
    console.warn(`Vizardry: writeSIPOCCell — row ${rowIndex} not found`);
    return false;
  }

  // Find the key: line within the row
  const targetPrefix = `${cellKey}:`;
  let cellLine = -1;

  for (let ln = rowLineStart + 1; ln <= rowLineEnd; ln++) {
    if (editor.getLine(ln).trim().toLowerCase().startsWith(targetPrefix)) {
      cellLine = ln;
      break;
    }
  }

  if (cellLine !== -1) {
    // Replace the existing value, preserving indent
    const raw = editor.getLine(cellLine);
    const indent = raw.match(/^(\s*)/)?.[1] ?? "  ";
    editor.replaceRange(
      `${indent}${cellKey}: ${newValue}`,
      { line: cellLine, ch: 0 },
      { line: cellLine, ch: raw.length },
    );
  } else {
    // Key absent — insert after the last non-blank line in the row block
    // (or directly after `row:` if the block is otherwise empty)
    let insertAfter = rowLineStart;
    for (let ln = rowLineStart + 1; ln <= rowLineEnd; ln++) {
      const t = editor.getLine(ln).trim();
      if (t && !t.startsWith("//")) insertAfter = ln;
    }
    const insertLineText = editor.getLine(insertAfter);
    editor.replaceRange(
      `\n  ${cellKey}: ${newValue}`,
      { line: insertAfter, ch: insertLineText.length },
    );
  }

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
