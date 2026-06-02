import type { App, MarkdownPostProcessorContext } from "obsidian";
import { MarkdownView } from "obsidian";

function resolveEditor(
  app: App,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  caller: string,
): { editor: MarkdownView["editor"]; lineStart: number; lineEnd: number } | null {
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

/**
 * Appends a new `task: <taskName>` line at the end of the named step's task
 * list. Deduplicates the name by appending " 2", " 3" etc. if needed.
 */
export function addStoryTask(
  app: App,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  stepName: string,
  taskName: string,
): boolean {
  const resolved = resolveEditor(app, ctx, el, "addStoryTask");
  if (!resolved) return false;
  const { editor, lineStart, lineEnd } = resolved;

  const stepKey = stepName.toLowerCase().trim();
  let stepLine = -1;
  let stepIndent = 0;
  let taskIndent = -1;
  let lastTaskLine = -1;

  for (let ln = lineStart; ln <= lineEnd; ln++) {
    const raw = editor.getLine(ln);
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("//")) continue;

    const indent = raw.search(/\S/);

    if (stepLine === -1) {
      if (indent === 0) continue; // activity/slice/etc lines
      if (trimmed.toLowerCase().startsWith("step:")) {
        const name = trimmed.slice("step:".length).trim().split("|")[0].trim().toLowerCase();
        if (name === stepKey) {
          stepLine = ln;
          stepIndent = indent;
        }
      }
      continue;
    }

    // We're inside the target step
    if (indent <= stepIndent && trimmed) {
      break; // Left the step block
    }
    if (trimmed.toLowerCase().startsWith("task:")) {
      if (taskIndent === -1) taskIndent = indent;
      lastTaskLine = ln;
    }
  }

  if (stepLine === -1) {
    console.warn(`Vizardry: addStoryTask — step "${stepName}" not found`);
    return false;
  }

  const taskIndentStr = taskIndent !== -1
    ? " ".repeat(taskIndent)
    : " ".repeat(stepIndent + 2);

  // Collect existing task names for deduplication
  const existingTasks = new Set<string>();
  if (lastTaskLine !== -1) {
    for (let ln = stepLine + 1; ln <= lineEnd; ln++) {
      const raw = editor.getLine(ln);
      const trimmed = raw.trim();
      if (!trimmed || trimmed.startsWith("//")) continue;
      const indent = raw.search(/\S/);
      if (indent <= stepIndent) break;
      if (trimmed.toLowerCase().startsWith("task:")) {
        const rest = trimmed.slice("task:".length).trim();
        const pipeIdx = rest.indexOf("|");
        const name = (pipeIdx === -1 ? rest : rest.slice(0, pipeIdx)).trim().toLowerCase();
        if (name) existingTasks.add(name);
      }
    }
  }

  let uniqueName = taskName.trim() || "New Task";
  if (existingTasks.has(uniqueName.toLowerCase())) {
    let idx = 2;
    while (existingTasks.has(`${uniqueName} ${idx}`.toLowerCase())) idx++;
    uniqueName = `${uniqueName} ${idx}`;
  }

  const insertAfter = lastTaskLine !== -1 ? lastTaskLine : stepLine;
  const insertLine = editor.getLine(insertAfter);
  editor.replaceRange(
    `\n${taskIndentStr}task: ${uniqueName}`,
    { line: insertAfter, ch: insertLine.length },
  );
  return true;
}

interface SliceInfo {
  headerLine: number;
  sliceName: string;
  cells: Array<{ line: number; stepKey: string; taskKeys: string[]; raw: string; indent: number }>;
}

function parseSlices(
  editor: { getLine: (n: number) => string },
  lineStart: number,
  lineEnd: number,
): SliceInfo[] {
  const slices: SliceInfo[] = [];
  let current: SliceInfo | null = null;
  let sliceIndent = -1;

  for (let ln = lineStart; ln <= lineEnd; ln++) {
    const raw = editor.getLine(ln);
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("//")) continue;
    const indent = raw.search(/\S/);

    if (indent === 0) {
      if (trimmed.toLowerCase().startsWith("slice:")) {
        const name = trimmed.slice("slice:".length).trim();
        current = { headerLine: ln, sliceName: name, cells: [] };
        slices.push(current);
        sliceIndent = -1;
      } else {
        current = null;
        sliceIndent = -1;
      }
      continue;
    }

    if (current && trimmed.toLowerCase().startsWith("step:")) {
      if (sliceIndent === -1) sliceIndent = indent;
      if (indent !== sliceIndent) continue;
      const rest = trimmed.slice("step:".length).trim();
      const pipeIdx = rest.indexOf("|");
      const stepKey = (pipeIdx === -1 ? rest : rest.slice(0, pipeIdx)).trim().toLowerCase();
      const taskList = pipeIdx !== -1 ? rest.slice(pipeIdx + 1).trim() : "";
      const taskKeys = taskList ? taskList.split(",").map(k => k.trim().toLowerCase()).filter(Boolean) : [];
      current.cells.push({ line: ln, stepKey, taskKeys, raw, indent });
    }
  }

  return slices;
}

/**
 * Moves a task from one slice band to another within the same step column.
 * The task's `task:` line in the activities block is unchanged; only the
 * slice cell references are updated.
 *
 * Pass `null` for `toSliceName` to move a task to the backlog (unsliced).
 * Pass `null` for `fromSliceName` to move a task from the backlog into a slice.
 */
export function moveStoryTaskSlice(
  app: App,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  taskName: string,
  stepName: string,
  fromSliceName: string | null,
  toSliceName: string | null,
): boolean {
  if (fromSliceName === toSliceName) return true;

  const resolved = resolveEditor(app, ctx, el, "moveStoryTaskSlice");
  if (!resolved) return false;
  const { editor, lineStart, lineEnd } = resolved;

  const taskKey = taskName.toLowerCase().trim();
  const stepKey = stepName.toLowerCase().trim();

  const slices = parseSlices(editor, lineStart, lineEnd);

  // Collect edits and apply bottom-up
  type Edit = { line: number; newText: string };
  const edits: Edit[] = [];

  // -- Remove from old slice --
  if (fromSliceName !== null) {
    const fromSlice = slices.find(s => s.sliceName === fromSliceName);
    if (fromSlice) {
      const cell = fromSlice.cells.find(c => c.stepKey === stepKey);
      if (cell) {
        const newKeys = cell.taskKeys.filter(k => k !== taskKey);
        const newLine = newKeys.length > 0
          ? `${" ".repeat(cell.indent)}step: ${stepName} | ${newKeys.join(", ")}`
          : `${" ".repeat(cell.indent)}step: ${stepName}`;
        edits.push({ line: cell.line, newText: newLine });
      }
    }
  }

  // -- Add to new slice --
  if (toSliceName !== null) {
    const toSlice = slices.find(s => s.sliceName === toSliceName);
    if (toSlice) {
      const cell = toSlice.cells.find(c => c.stepKey === stepKey);
      if (cell) {
        // Check we're not adding a duplicate
        if (!cell.taskKeys.includes(taskKey)) {
          const newKeys = [...cell.taskKeys, taskKey];
          const newLine = `${" ".repeat(cell.indent)}step: ${stepName} | ${newKeys.join(", ")}`;
          // If we already have an edit for this line (from the remove step), merge
          const existing = edits.find(e => e.line === cell.line);
          if (existing) {
            existing.newText = newLine;
          } else {
            edits.push({ line: cell.line, newText: newLine });
          }
        }
      } else {
        // No cell for this step yet in the target slice — insert one
        // Determine the indent from the slice's other cells or default to 2
        const indentStr = toSlice.cells.length > 0
          ? " ".repeat(toSlice.cells[0].indent)
          : "  ";
        // Insert after the last cell under this slice (or after the header if no cells)
        const insertAfterLine = toSlice.cells.length > 0
          ? toSlice.cells[toSlice.cells.length - 1].line
          : toSlice.headerLine;
        const afterText = editor.getLine(insertAfterLine);
        edits.push({
          line: insertAfterLine,
          newText: afterText + `\n${indentStr}step: ${stepName} | ${taskKey}`,
        });
      }
    } else {
      console.warn(`Vizardry: moveStoryTaskSlice — target slice "${toSliceName}" not found`);
      return false;
    }
  }

  if (edits.length === 0) return true;

  // Apply bottom-up by line number
  edits.sort((a, b) => b.line - a.line);
  for (const edit of edits) {
    const raw = editor.getLine(edit.line);
    editor.replaceRange(edit.newText, { line: edit.line, ch: 0 }, { line: edit.line, ch: raw.length });
  }

  return true;
}

/**
 * Reorders a task within the same slice's cell list for a given step.
 * Moves the item at `fromIndex` to `toIndex` in the comma-separated task list.
 */
export function reorderStoryTask(
  app: App,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  stepName: string,
  sliceName: string | null,
  fromIndex: number,
  toIndex: number,
): boolean {
  if (fromIndex === toIndex) return true;
  if (sliceName === null) return true; // backlog order is derived from task declaration order

  const resolved = resolveEditor(app, ctx, el, "reorderStoryTask");
  if (!resolved) return false;
  const { editor, lineStart, lineEnd } = resolved;

  const stepKey = stepName.toLowerCase().trim();
  const slices = parseSlices(editor, lineStart, lineEnd);
  const slice = slices.find(s => s.sliceName === sliceName);
  if (!slice) {
    console.warn(`Vizardry: reorderStoryTask — slice "${sliceName}" not found`);
    return false;
  }

  const cell = slice.cells.find(c => c.stepKey === stepKey);
  if (!cell || cell.taskKeys.length < 2) return true;

  const keys = [...cell.taskKeys];
  const [moved] = keys.splice(fromIndex, 1);
  keys.splice(toIndex, 0, moved);

  const newLine = `${" ".repeat(cell.indent)}step: ${stepName} | ${keys.join(", ")}`;
  const raw = editor.getLine(cell.line);
  editor.replaceRange(newLine, { line: cell.line, ch: 0 }, { line: cell.line, ch: raw.length });
  return true;
}
