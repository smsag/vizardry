import type { App, MarkdownPostProcessorContext } from "obsidian";
import { resolveEditor } from "./editor";

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

  // Locate the Nth task: block
  let taskCount = -1;
  let taskLineStart = -1;
  let taskLineEnd = lineEnd;

  for (let ln = lineStart; ln <= lineEnd; ln++) {
    const trimmed = editor.getLine(ln).trim().toLowerCase();
    if (trimmed.startsWith("task:")) {
      taskCount++;
      if (taskCount === rowIndex) {
        taskLineStart = ln;
      } else if (taskCount > rowIndex) {
        taskLineEnd = ln - 1;
        break;
      }
    }
  }

  if (taskLineStart === -1) {
    console.warn(`Vizardry: writeRACICell — task ${rowIndex} not found`);
    return false;
  }

  // Editing the task name itself
  if (cellKey === "task") {
    const raw = editor.getLine(taskLineStart);
    editor.replaceRange(
      `task: ${newValue}`,
      { line: taskLineStart, ch: 0 },
      { line: taskLineStart, ch: raw.length },
    );
    return true;
  }

  // Editing a RACI sub-key
  const targetPrefix = `${cellKey}:`;
  let cellLine = -1;

  for (let ln = taskLineStart + 1; ln <= taskLineEnd; ln++) {
    if (editor.getLine(ln).trim().toLowerCase().startsWith(targetPrefix)) {
      cellLine = ln;
      break;
    }
  }

  if (cellLine !== -1) {
    const raw = editor.getLine(cellLine);
    const indent = raw.match(/^(\s*)/)?.[1] ?? "  ";
    editor.replaceRange(
      `${indent}${cellKey}: ${newValue}`,
      { line: cellLine, ch: 0 },
      { line: cellLine, ch: raw.length },
    );
  } else {
    let insertAfter = taskLineStart;
    for (let ln = taskLineStart + 1; ln <= taskLineEnd; ln++) {
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
