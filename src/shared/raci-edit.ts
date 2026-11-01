import type { App, Editor, MarkdownPostProcessorContext } from "obsidian";
import { resolveEditor } from "./editor";
import { findNthKeyedBlock, writeKeyedSubLine, type KeyedBlock } from "./keyed-block-edit";
import { editorWrite } from "./tree-editor-access";
import { indentOf } from "./indent";

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
    editorWrite(() => {
      editor.replaceRange(
        `task: ${newValue}`,
        { line: task.blockLineStart, ch: 0 },
        { line: task.blockLineStart, ch: raw.length },
      );
    }, el);
    return true;
  }

  // Editing a RACI sub-key
  editorWrite(() => {
    writeKeyedSubLine(editor, task, cellKey, newValue);
  }, el);
  return true;
}

const ROLE_KEYS = ["responsible", "accountable", "consulted", "informed"] as const;
type RoleValues = Record<typeof ROLE_KEYS[number], string>;

const isTaskHeader = (t: string): boolean => t.startsWith("task:");

/**
 * The sub-lines of one task after setting all four role cells at once: a
 * role's existing line is rewritten in place (keeping its indent) or dropped
 * when the value is empty; a role without a line gets one appended. Comments
 * and anything else in the block are kept where they are.
 *
 * Pure, so the line logic is tested without an editor.
 */
export function rewriteRoleLines(subLines: string[], values: RoleValues): string[] {
  const written = new Set<string>();
  const out: string[] = [];
  for (const raw of subLines) {
    const lower = raw.trim().toLowerCase();
    const key = ROLE_KEYS.find(k => lower.startsWith(`${k}:`));
    if (!key) { out.push(raw); continue; }
    written.add(key);
    if (values[key]) out.push(`${raw.match(/^(\s*)/)![1]}${key}: ${values[key]}`);
  }
  for (const key of ROLE_KEYS) {
    if (!written.has(key) && values[key]) out.push(`  ${key}: ${values[key]}`);
  }
  return out;
}

/** Last indented, non-blank line of a task block, or its header line. */
function lastSubLine(editor: Editor, block: KeyedBlock): number {
  let last = block.blockLineStart;
  for (let ln = block.blockLineStart + 1; ln <= block.blockLineEnd; ln++) {
    const raw = editor.getLine(ln);
    const t = raw.trim();
    if (t && !t.startsWith("```") && indentOf(raw) > 0) last = ln;
  }
  return last;
}

/** Replaces one task's sub-lines with `values` (see rewriteRoleLines). */
function replaceRoleLines(editor: Editor, block: KeyedBlock, values: RoleValues): void {
  const end = lastSubLine(editor, block);
  const sub: string[] = [];
  for (let ln = block.blockLineStart + 1; ln <= end; ln++) sub.push(editor.getLine(ln));
  const next = rewriteRoleLines(sub, values);
  // Anchored at the end of the header line, so a task that loses every role
  // takes its now-empty lines with it instead of leaving blanks behind.
  editor.replaceRange(
    next.map(l => `\n${l}`).join(""),
    { line: block.blockLineStart, ch: editor.getLine(block.blockLineStart).length },
    { line: end, ch: editor.getLine(end).length },
  );
}

/**
 * Sets all four role cells of the `rowIndex`-th task in one write — what a
 * person-column change needs, since moving someone from Consulted to
 * Responsible touches two lines.
 */
export function writeRACIRoles(
  app: App,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  rowIndex: number,
  values: RoleValues,
): boolean {
  const resolved = resolveEditor(app, ctx, el, "writeRACIRoles");
  if (!resolved) return false;
  const { editor, lineStart, lineEnd } = resolved;
  const task = findNthKeyedBlock(editor, lineStart, lineEnd, isTaskHeader, rowIndex);
  if (!task) {
    console.warn(`Vizardry: writeRACIRoles — task ${rowIndex} not found`);
    return false;
  }
  editorWrite(() => replaceRoleLines(editor, task, values), el);
  return true;
}

/**
 * Applies per-task role values to several tasks in one write (renaming a
 * person touches every task that names them). `updates` maps a task index to
 * its new values; tasks are rewritten bottom-up so earlier line numbers stay
 * valid while later blocks change length.
 */
export function writeRACIRolesMany(
  app: App,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  updates: Map<number, RoleValues>,
): boolean {
  if (updates.size === 0) return true;
  const resolved = resolveEditor(app, ctx, el, "writeRACIRolesMany");
  if (!resolved) return false;
  const { editor, lineStart, lineEnd } = resolved;
  const blocks: [KeyedBlock, RoleValues][] = [];
  for (const [rowIndex, values] of updates) {
    const task = findNthKeyedBlock(editor, lineStart, lineEnd, isTaskHeader, rowIndex);
    if (!task) {
      console.warn(`Vizardry: writeRACIRolesMany — task ${rowIndex} not found`);
      return false;
    }
    blocks.push([task, values]);
  }
  blocks.sort((a, b) => b[0].blockLineStart - a[0].blockLineStart);
  editorWrite(() => {
    for (const [task, values] of blocks) replaceRoleLines(editor, task, values);
  }, el);
  return true;
}

/** Appends `task: <name>` after the last line of the block, one blank line above it. */
export function appendRACITask(
  app: App,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  name: string,
): boolean {
  const resolved = resolveEditor(app, ctx, el, "appendRACITask");
  if (!resolved) return false;
  const { editor, lineStart, lineEnd } = resolved;
  // lineEnd is the closing fence; the new task goes after the last content line.
  let last = lineEnd - 1;
  while (last > lineStart && editor.getLine(last).trim() === "") last--;
  editorWrite(() => {
    editor.replaceRange(`\n\ntask: ${name}`, { line: last, ch: editor.getLine(last).length });
  }, el);
  return true;
}
