import type { App, MarkdownPostProcessorContext } from "obsidian";
import { resolveEditor } from "./editor";
import { findNthKeyedBlock, writeKeyedSubLine } from "./keyed-block-edit";

/**
 * Writes an updated cell value back into the source code block for a
 * RACI Matrix diagram.
 *
 * For RACI sub-keys (responsible/accountable/consulted/informed): locates
 * the Nth `task:` block and replaces or inserts the key: value line.
 *
 * For the task name itself (cellKey === "task"): replaces the `task: OldName`
 * line with `task: NewName`.
 */
export function writeRACICell(
  app: App,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  rowIndex: number,
  cellKey: string,
  newValue: string,
): boolean {
  const resolved = resolveEditor(app, ctx, el, "writeRACICell");
  if (!resolved) return false;
  const { editor, lineStart, lineEnd } = resolved;

  const task = findNthKeyedBlock(editor, lineStart, lineEnd, t => t.startsWith("task:"), rowIndex);
  if (!task) {
    console.warn(`Vizardry: writeRACICell — task ${rowIndex} not found`);
    return false;
  }

  // Editing the task name itself
  if (cellKey === "task") {
    const raw = editor.getLine(task.blockLineStart);
    editor.replaceRange(
      `task: ${newValue}`,
      { line: task.blockLineStart, ch: 0 },
      { line: task.blockLineStart, ch: raw.length },
    );
    return true;
  }

  // Editing a RACI sub-key
  writeKeyedSubLine(editor, task, cellKey, newValue);
  return true;
}
