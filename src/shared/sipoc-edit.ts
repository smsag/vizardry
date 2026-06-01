import type { App, MarkdownPostProcessorContext } from "obsidian";
import { MarkdownView } from "obsidian";

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
  const info = ctx.getSectionInfo(el);
  if (!info) {
    console.warn("Vizardry: writeSIPOCCell — no section info");
    return false;
  }

  const file = app.vault.getFileByPath(ctx.sourcePath);
  if (!file) {
    console.warn(`Vizardry: writeSIPOCCell — file not found: ${ctx.sourcePath}`);
    return false;
  }

  const leaf = app.workspace.getLeavesOfType("markdown").find(
    l => l.view instanceof MarkdownView && l.view.file?.path === ctx.sourcePath
  );
  const editor = leaf?.view instanceof MarkdownView ? leaf.view.editor : undefined;
  if (!editor) {
    console.warn("Vizardry: writeSIPOCCell — no live editor");
    return false;
  }

  const { lineStart, lineEnd } = info;

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
      if (t && !t.startsWith("#")) insertAfter = ln;
    }
    const insertLineText = editor.getLine(insertAfter);
    editor.replaceRange(
      `\n  ${cellKey}: ${newValue}`,
      { line: insertAfter, ch: insertLineText.length },
    );
  }

  return true;
}
