import type { App, MarkdownPostProcessorContext } from "obsidian";
import { Notice } from "obsidian";
import { resolveEditor } from "./editor";

/** Escapes a string for safe use inside a RegExp. */
function escRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface StepBlock {
  stepLine: number;
  stepIndent: number;
  taskIndent: number;
  lastTaskLine: number;
  taskIndentStr: string;
}

/**
 * Finds the block boundaries of a `step: <stepName>` declaration within
 * the activity section of a code block (not slice section — activity steps
 * have indent > 0 and no pipe character after the step name).
 */
function findStepBlock(
  editor: { getLine: (n: number) => string },
  lineStart: number,
  lineEnd: number,
  stepName: string,
): StepBlock | null {
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
      if (indent === 0) continue;
      // Activity step: indented, starts with "step:", NO pipe (slice steps have pipes)
      if (trimmed.toLowerCase().startsWith("step:")) {
        const afterStep = trimmed.slice("step:".length).trim();
        if (!afterStep.includes("|")) {
          const name = afterStep.trim().toLowerCase();
          if (name === stepKey) {
            stepLine = ln;
            stepIndent = indent;
          }
        }
      }
      continue;
    }

    // Inside the target step
    if (indent <= stepIndent && trimmed) break;
    if (trimmed.toLowerCase().startsWith("task:")) {
      if (taskIndent === -1) taskIndent = indent;
      lastTaskLine = ln;
    }
  }

  if (stepLine === -1) return null;
  const taskIndentStr = taskIndent !== -1
    ? " ".repeat(taskIndent)
    : " ".repeat(stepIndent + 2);
  return { stepLine, stepIndent, taskIndent, lastTaskLine, taskIndentStr };
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

  const block = findStepBlock(editor, lineStart, lineEnd, stepName);
  if (!block) {
    new Notice(`Vizardry: step "${stepName}" not found in story map.`, 4000);
    return false;
  }
  const { stepLine, stepIndent, lastTaskLine, taskIndentStr } = block;

  // Collect existing task names for deduplication
  const existingTasks = new Set<string>();
  for (let ln = stepLine + 1; ln <= lineEnd; ln++) {
    const raw = editor.getLine(ln);
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("//")) continue;
    if (raw.search(/\S/) <= stepIndent) break;
    if (trimmed.toLowerCase().startsWith("task:")) {
      const rest = trimmed.slice("task:".length).trim();
      const pipeIdx = rest.indexOf("|");
      const name = (pipeIdx === -1 ? rest : rest.slice(0, pipeIdx)).trim().toLowerCase();
      if (name) existingTasks.add(name);
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

/**
 * Deletes a task from the USM source:
 * - Removes the `task: <taskName>` declaration line from its activity step block
 * - Removes the task key from every slice cell reference that contains it
 */
export function deleteStoryTask(
  app: App,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  taskName: string,
): boolean {
  const resolved = resolveEditor(app, ctx, el, "deleteStoryTask");
  if (!resolved) return false;
  const { editor, lineStart, lineEnd } = resolved;

  const taskKey = taskName.toLowerCase().trim();
  const taskRe = new RegExp(`^(\\s*task:\\s*)${escRe(taskName)}(\\s*(?:\\|.*)?$)`, "i");

  type Edit = { line: number; newText: string | null }; // null = delete line
  const edits: Edit[] = [];

  // Phase A — find and delete the task declaration line
  for (let ln = lineStart; ln <= lineEnd; ln++) {
    const raw = editor.getLine(ln);
    if (taskRe.test(raw)) {
      edits.push({ line: ln, newText: null });
      break;
    }
  }

  // Phase B — remove the task key from all slice cell references
  const slices = parseSlices(editor, lineStart, lineEnd);
  for (const slice of slices) {
    for (const cell of slice.cells) {
      if (!cell.taskKeys.includes(taskKey)) continue;
      const newKeys = cell.taskKeys.filter(k => k !== taskKey);
      const newLine = newKeys.length > 0
        ? `${" ".repeat(cell.indent)}step: ${cell.raw.trim().slice("step:".length).split("|")[0].trim()} | ${newKeys.join(", ")}`
        : `${" ".repeat(cell.indent)}step: ${cell.raw.trim().slice("step:".length).split("|")[0].trim()}`;
      edits.push({ line: cell.line, newText: newLine });
    }
  }

  if (edits.length === 0) {
    new Notice(`Vizardry: task "${taskName}" not found in story map.`, 4000);
    return false;
  }

  edits.sort((a, b) => b.line - a.line);
  for (const edit of edits) {
    if (edit.newText === null) {
      editor.replaceRange("", { line: edit.line, ch: 0 }, { line: edit.line + 1, ch: 0 });
    } else {
      const raw = editor.getLine(edit.line);
      editor.replaceRange(edit.newText, { line: edit.line, ch: 0 }, { line: edit.line, ch: raw.length });
    }
  }
  return true;
}

/**
 * Writes or removes a top-level `user:` or `goal:` line.
 * If value is empty the existing line is deleted. If no line exists and value
 * is non-empty, a new line is inserted right after any `title:` line
 * (or after the opening fence if there is no title line).
 */
export function writeStoryMeta(
  app: App,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  key: "user" | "goal",
  value: string,
): boolean {
  const resolved = resolveEditor(app, ctx, el, "writeStoryMeta");
  if (!resolved) return false;
  const { editor, lineStart, lineEnd } = resolved;

  const trimmedValue = value.trim();

  // Find existing key line
  let foundLine = -1;
  for (let ln = lineStart + 1; ln < lineEnd; ln++) {
    if (editor.getLine(ln).trim().toLowerCase().startsWith(`${key}:`)) {
      foundLine = ln;
      break;
    }
  }

  if (!trimmedValue) {
    if (foundLine !== -1) {
      editor.replaceRange("", { line: foundLine, ch: 0 }, { line: foundLine + 1, ch: 0 });
    }
    return true;
  }

  const newLineText = `${key}: ${trimmedValue}`;

  if (foundLine !== -1) {
    const raw = editor.getLine(foundLine);
    editor.replaceRange(newLineText, { line: foundLine, ch: 0 }, { line: foundLine, ch: raw.length });
    return true;
  }

  // No existing line — insert after title: (line lineStart+1) if present, else at lineStart+1
  let insertAt = lineStart + 1;
  const firstContent = editor.getLine(lineStart + 1).trim().toLowerCase();
  if (firstContent.startsWith("title:")) insertAt = lineStart + 2;

  editor.replaceRange(`${newLineText}\n`, { line: insertAt, ch: 0 });
  return true;
}

/**
 * Renames an `activity: <oldName>` line in-place.
 * Activity names are not referenced elsewhere so no cascade is needed.
 */
export function renameStoryActivity(
  app: App,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  oldName: string,
  newName: string,
): boolean {
  if (!newName.trim() || newName === oldName) return false;

  const resolved = resolveEditor(app, ctx, el, "renameStoryActivity");
  if (!resolved) return false;
  const { editor, lineStart, lineEnd } = resolved;

  const re = new RegExp(`^(activity:\\s*)${escRe(oldName)}\\s*$`, "i");

  for (let ln = lineStart; ln <= lineEnd; ln++) {
    const raw = editor.getLine(ln);
    if (re.test(raw.trim())) {
      editor.replaceRange(
        `activity: ${newName}`,
        { line: ln, ch: 0 }, { line: ln, ch: raw.length },
      );
      return true;
    }
  }

  new Notice(`Vizardry: activity "${oldName}" not found.`, 4000);
  return false;
}

/**
 * Renames a step throughout the source block:
 * - The `step: <oldName>` declaration inside its activity block
 * - All `step: <oldName>` or `step: <oldName> | ...` lines inside slice blocks
 */
export function renameStoryStep(
  app: App,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  oldName: string,
  newName: string,
): boolean {
  if (!newName.trim() || newName === oldName) return false;

  const resolved = resolveEditor(app, ctx, el, "renameStoryStep");
  if (!resolved) return false;
  const { editor, lineStart, lineEnd } = resolved;

  // Match `step: <oldName>` with optional trailing `| ...` (case-insensitive on the name)
  // Used for BOTH activity declarations (no pipe) and slice cells (may have pipe).
  const re = new RegExp(`^(\\s*step:\\s*)${escRe(oldName)}(\\s*(?:\\|.*)?$)`, "i");

  type Edit = { line: number; newText: string };
  const edits: Edit[] = [];

  for (let ln = lineStart; ln <= lineEnd; ln++) {
    const raw = editor.getLine(ln);
    if (re.test(raw)) {
      edits.push({ line: ln, newText: raw.replace(re, `$1${newName}$2`) });
    }
  }

  if (edits.length === 0) {
    new Notice(`Vizardry: step "${oldName}" not found.`, 4000);
    return false;
  }

  // Apply bottom-up
  edits.sort((a, b) => b.line - a.line);
  for (const edit of edits) {
    const raw = editor.getLine(edit.line);
    editor.replaceRange(edit.newText, { line: edit.line, ch: 0 }, { line: edit.line, ch: raw.length });
  }
  return true;
}

/**
 * Renames a task throughout the source block:
 * - The `task: <oldName>` or `task: <oldName> | subtitle` declaration line
 * - All slice cell references that use the old lowercased task key
 */
export function renameStoryTask(
  app: App,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  oldName: string,
  newName: string,
): boolean {
  if (!newName.trim() || newName === oldName) return false;

  const resolved = resolveEditor(app, ctx, el, "renameStoryTask");
  if (!resolved) return false;
  const { editor, lineStart, lineEnd } = resolved;

  const oldKey = oldName.toLowerCase().trim();
  const newKey = newName.toLowerCase().trim();

  type Edit = { line: number; newText: string };
  const edits: Edit[] = [];

  // Phase A — task declaration line
  const taskRe = new RegExp(`^(\\s*task:\\s*)${escRe(oldName)}(\\s*(?:\\|.*)?$)`, "i");
  for (let ln = lineStart; ln <= lineEnd; ln++) {
    const raw = editor.getLine(ln);
    if (taskRe.test(raw)) {
      edits.push({ line: ln, newText: raw.replace(taskRe, `$1${newName}$2`) });
      break; // task names are unique per step; first match is correct
    }
  }

  // Phase B — slice cell references (comma-separated lowercase keys)
  const slices = parseSlices(editor, lineStart, lineEnd);
  for (const slice of slices) {
    for (const cell of slice.cells) {
      if (!cell.taskKeys.includes(oldKey)) continue;
      const newKeys = cell.taskKeys.map(k => k === oldKey ? newKey : k);
      // Reconstruct the cell line preserving the original step display name
      const rest = cell.raw.trim().slice("step:".length).trim();
      const pipeIdx = rest.indexOf("|");
      const stepDisplayName = pipeIdx === -1 ? rest : rest.slice(0, pipeIdx).trim();
      const newLine = `${" ".repeat(cell.indent)}step: ${stepDisplayName} | ${newKeys.join(", ")}`;
      edits.push({ line: cell.line, newText: newLine });
    }
  }

  if (edits.length === 0) {
    new Notice(`Vizardry: task "${oldName}" not found.`, 4000);
    return false;
  }

  edits.sort((a, b) => b.line - a.line);
  for (const edit of edits) {
    const raw = editor.getLine(edit.line);
    editor.replaceRange(edit.newText, { line: edit.line, ch: 0 }, { line: edit.line, ch: raw.length });
  }
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

  type Edit = { line: number; newText: string };
  const edits: Edit[] = [];

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

  if (toSliceName !== null) {
    const toSlice = slices.find(s => s.sliceName === toSliceName);
    if (toSlice) {
      const cell = toSlice.cells.find(c => c.stepKey === stepKey);
      if (cell) {
        if (!cell.taskKeys.includes(taskKey)) {
          const newKeys = [...cell.taskKeys, taskKey];
          const newLine = `${" ".repeat(cell.indent)}step: ${stepName} | ${newKeys.join(", ")}`;
          const existing = edits.find(e => e.line === cell.line);
          if (existing) { existing.newText = newLine; }
          else { edits.push({ line: cell.line, newText: newLine }); }
        }
      } else {
        const indentStr = toSlice.cells.length > 0
          ? " ".repeat(toSlice.cells[0].indent)
          : "  ";
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
      new Notice(`Vizardry: target slice "${toSliceName}" not found.`, 4000);
      return false;
    }
  }

  if (edits.length === 0) return true;

  edits.sort((a, b) => b.line - a.line);
  for (const edit of edits) {
    const raw = editor.getLine(edit.line);
    editor.replaceRange(edit.newText, { line: edit.line, ch: 0 }, { line: edit.line, ch: raw.length });
  }
  return true;
}

/**
 * Reorders a task within the same slice's cell list for a given step.
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
  if (sliceName === null) return true;

  const resolved = resolveEditor(app, ctx, el, "reorderStoryTask");
  if (!resolved) return false;
  const { editor, lineStart, lineEnd } = resolved;

  const stepKey = stepName.toLowerCase().trim();
  const slices = parseSlices(editor, lineStart, lineEnd);
  const slice = slices.find(s => s.sliceName === sliceName);
  if (!slice) return true;

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

/**
 * Moves a task to a different step column (cross-column drag):
 * - Removes the `task:` line from `fromStepName`'s activity block
 * - Appends the `task:` line (preserving subtitle) to `toStepName`'s activity block
 * - Updates all slice cell references: moves the task key from the old step key
 *   to the new step key within each slice that had it.
 * - If `toSliceName` is provided, adds the task to that slice under the new step.
 * - If `toSliceName` is null, the task lands in the backlog (unsliced).
 */
export function moveStoryTaskCrossColumn(
  app: App,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  taskName: string,
  fromStepName: string,
  toStepName: string,
  toSliceName: string | null,
): boolean {
  if (fromStepName === toStepName) return true;

  const resolved = resolveEditor(app, ctx, el, "moveStoryTaskCrossColumn");
  if (!resolved) return false;
  const { editor, lineStart, lineEnd } = resolved;

  const taskKey = taskName.toLowerCase().trim();
  const fromStepKey = fromStepName.toLowerCase().trim();
  const toStepKey = toStepName.toLowerCase().trim();

  // Find the task declaration line in fromStep
  const fromBlock = findStepBlock(editor, lineStart, lineEnd, fromStepName);
  if (!fromBlock) {
    new Notice(`Vizardry: source step "${fromStepName}" not found.`, 4000);
    return false;
  }

  let taskLine = -1;
  let taskRaw = "";
  const taskRe = new RegExp(`^(\\s*task:\\s*)${escRe(taskName)}(\\s*(?:\\|.*)?$)`, "i");
  for (let ln = fromBlock.stepLine + 1; ln <= lineEnd; ln++) {
    const raw = editor.getLine(ln);
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("//")) continue;
    if (raw.search(/\S/) <= fromBlock.stepIndent) break;
    if (taskRe.test(raw)) {
      taskLine = ln;
      taskRaw = trimmed; // `task: Name | subtitle`
      break;
    }
  }

  if (taskLine === -1) {
    new Notice(`Vizardry: task "${taskName}" not found in step "${fromStepName}".`, 4000);
    return false;
  }

  // Find the insertion point in toStep
  const toBlock = findStepBlock(editor, lineStart, lineEnd, toStepName);
  if (!toBlock) {
    new Notice(`Vizardry: destination step "${toStepName}" not found.`, 4000);
    return false;
  }
  const insertAfterLine = toBlock.lastTaskLine !== -1 ? toBlock.lastTaskLine : toBlock.stepLine;
  const newTaskLine = `${toBlock.taskIndentStr}${taskRaw}`;

  // Slice cell edits — collect before modifying line numbers
  const slices = parseSlices(editor, lineStart, lineEnd);

  type Edit = { line: number; newText: string };
  const sliceEdits: Edit[] = [];

  for (const slice of slices) {
    const fromCell = slice.cells.find(c => c.stepKey === fromStepKey);
    if (!fromCell || !fromCell.taskKeys.includes(taskKey)) continue;

    // Remove from old step key in this slice
    const newFromKeys = fromCell.taskKeys.filter(k => k !== taskKey);
    const newFromLine = newFromKeys.length > 0
      ? `${" ".repeat(fromCell.indent)}step: ${fromStepName} | ${newFromKeys.join(", ")}`
      : `${" ".repeat(fromCell.indent)}step: ${fromStepName}`;
    sliceEdits.push({ line: fromCell.line, newText: newFromLine });

    // Add to new step key only in the target slice (if specified)
    if (toSliceName !== null && slice.sliceName === toSliceName) {
      const toCell = slice.cells.find(c => c.stepKey === toStepKey);
      if (toCell) {
        if (!toCell.taskKeys.includes(taskKey)) {
          const newToKeys = [...toCell.taskKeys, taskKey];
          const newToLine = `${" ".repeat(toCell.indent)}step: ${toStepName} | ${newToKeys.join(", ")}`;
          const existing = sliceEdits.find(e => e.line === toCell.line);
          if (existing) { existing.newText = newToLine; }
          else { sliceEdits.push({ line: toCell.line, newText: newToLine }); }
        }
      } else {
        // Insert new cell for toStep in this slice
        const indentStr = slice.cells.length > 0
          ? " ".repeat(slice.cells[0].indent)
          : "  ";
        const insertAfter = slice.cells.length > 0
          ? slice.cells[slice.cells.length - 1].line
          : slice.headerLine;
        const afterText = editor.getLine(insertAfter);
        sliceEdits.push({
          line: insertAfter,
          newText: afterText + `\n${indentStr}step: ${toStepName} | ${taskKey}`,
        });
      }
    }
  }

  // If toSliceName is specified but the task wasn't in that slice yet under fromStepKey,
  // we still need to add it to toSliceName under toStepKey.
  if (toSliceName !== null) {
    const targetSlice = slices.find(s => s.sliceName === toSliceName);
    if (targetSlice) {
      const toCell = targetSlice.cells.find(c => c.stepKey === toStepKey);
      const alreadyAdded = sliceEdits.some(e => {
        // Check if we already have an edit adding the task to toCell or inserting a new cell
        if (toCell) return e.line === toCell.line && e.newText.toLowerCase().includes(taskKey);
        return false;
      });
      if (!alreadyAdded) {
        const fromCellInTarget = targetSlice.cells.find(c => c.stepKey === fromStepKey);
        if (!fromCellInTarget || !fromCellInTarget.taskKeys.includes(taskKey)) {
          // Task was not in this slice under fromStep, add it under toStep
          if (toCell) {
            if (!toCell.taskKeys.includes(taskKey)) {
              const newToKeys = [...toCell.taskKeys, taskKey];
              const newToLine = `${" ".repeat(toCell.indent)}step: ${toStepName} | ${newToKeys.join(", ")}`;
              const existing = sliceEdits.find(e => e.line === toCell.line);
              if (existing) { existing.newText = newToLine; }
              else { sliceEdits.push({ line: toCell.line, newText: newToLine }); }
            }
          } else {
            const indentStr = targetSlice.cells.length > 0
              ? " ".repeat(targetSlice.cells[0].indent)
              : "  ";
            const insertAfter = targetSlice.cells.length > 0
              ? targetSlice.cells[targetSlice.cells.length - 1].line
              : targetSlice.headerLine;
            const afterText = editor.getLine(insertAfter);
            sliceEdits.push({
              line: insertAfter,
              newText: afterText + `\n${indentStr}step: ${toStepName} | ${taskKey}`,
            });
          }
        }
      }
    }
  }

  // Apply all edits bottom-up.
  // Slice edits are always below activity edits in the source.
  // Within activity edits: apply the higher line first.
  sliceEdits.sort((a, b) => b.line - a.line);
  for (const edit of sliceEdits) {
    const raw = editor.getLine(edit.line);
    editor.replaceRange(edit.newText, { line: edit.line, ch: 0 }, { line: edit.line, ch: raw.length });
  }

  // Now apply the task line move (in the activities section).
  // Apply delete then insert or insert then delete, always higher line first.
  if (taskLine > insertAfterLine) {
    // Delete first (higher), then insert (lower)
    editor.replaceRange("", { line: taskLine, ch: 0 }, { line: taskLine + 1, ch: 0 });
    const afterText = editor.getLine(insertAfterLine);
    editor.replaceRange(
      `\n${newTaskLine}`,
      { line: insertAfterLine, ch: afterText.length },
    );
  } else {
    // taskLine < insertAfterLine: insert at the lower position first, then
    // delete the original line. The insertion is BELOW taskLine so taskLine
    // does NOT shift — delete it as-is (no +1 adjustment).
    const afterText = editor.getLine(insertAfterLine);
    editor.replaceRange(
      `\n${newTaskLine}`,
      { line: insertAfterLine, ch: afterText.length },
    );
    editor.replaceRange("", { line: taskLine, ch: 0 }, { line: taskLine + 1, ch: 0 });
  }

  return true;
}
