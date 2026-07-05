/**
 * In-place source edits for the Impact Map canvas.
 *
 * Source format (keyword-based, four levels):
 *   goal: Desired Goal
 *   actor: User
 *     impact: Increased productivity
 *       deliverable: Feature A
 *
 * Level keywords:
 *   0 → "goal"         (at indent 0)
 *   1 → "actor"        (at indent 0)
 *   2 → "impact"       (indented under actor)
 *   3 → "deliverable"  (indented under impact)
 *
 * Note: goal and actor are both at indent 0 in the source.
 * Nesting is tracked structurally (impact must follow actor, etc.)
 * rather than by indentation level.
 *
 * All functions follow the wardley-edit.ts pattern.
 */

import type { App, MarkdownPostProcessorContext } from "obsidian";
import {
  getEditorAccess,
  detectIndentUnit,
  subtreeEnd,
  deleteLines,
  editorWrite,
} from "./tree-editor-access";

export type ImpactLevel = "goal" | "actor" | "impact" | "deliverable";

/** Maps Impact Map tree level numbers to source keywords. */
const LEVEL_KEYWORD: Record<number, ImpactLevel> = {
  0: "goal",
  1: "actor",
  2: "impact",
  3: "deliverable",
};

/** Maps keywords to their child keyword. */
const CHILD_KEYWORD: Partial<Record<ImpactLevel, ImpactLevel>> = {
  goal: "actor",
  actor: "impact",
  impact: "deliverable",
};

// ── Rename ───────────────────────────────────────────────────────────────────

/**
 * Renames an Impact Map node at the given level.
 * Finds the first line matching `keyword: oldText` and replaces the value.
 */
export function renameImpactNode(
  app: App,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  level: number,
  oldText: string,
  newText: string,
): boolean {
  if (!newText.trim() || newText === oldText) return false;

  const keyword = LEVEL_KEYWORD[level];
  if (!keyword) return false;

  const access = getEditorAccess(app, ctx, el, "renameImpactNode");
  if (!access) return false;
  const { editor, lineStart, lineEnd } = access;

  const prefix = `${keyword}:`;
  for (let ln = lineStart; ln <= lineEnd; ln++) {
    const raw = editor.getLine(ln);
    const trimmed = raw.trim();
    if (!trimmed.toLowerCase().startsWith(prefix)) continue;
    const value = trimmed.slice(prefix.length).trim();
    if (value !== oldText) continue;

    const indentStr = raw.slice(0, raw.search(/\S/));
    editorWrite(() => editor.replaceRange(
      `${indentStr}${prefix} ${newText}`,
      { line: ln, ch: 0 }, { line: ln, ch: raw.length },
    ), el);
    return true;
  }

  console.warn(`Vizardry: renameImpactNode — ${keyword}: "${oldText}" not found in source`);
  return false;
}

// ── Add child ────────────────────────────────────────────────────────────────

/**
 * Appends a new child under the node identified by (level, parentText).
 * The child uses the keyword for level+1, indented one unit deeper.
 */
export function addImpactChild(
  app: App,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  parentLevel: number,
  parentText: string,
  newChildText: string,
): boolean {
  const parentKeyword = LEVEL_KEYWORD[parentLevel];
  const childKeyword = CHILD_KEYWORD[parentKeyword ?? "deliverable"];
  if (!parentKeyword || !childKeyword) {
    console.warn("Vizardry: addImpactChild — deliverables cannot have children");
    return false;
  }

  const access = getEditorAccess(app, ctx, el, "addImpactChild");
  if (!access) return false;
  const { editor, lineStart, lineEnd } = access;

  const indentUnit = detectIndentUnit(editor, lineStart, lineEnd);
  const parentPrefix = `${parentKeyword}:`;

  for (let ln = lineStart; ln <= lineEnd; ln++) {
    const raw = editor.getLine(ln);
    const trimmed = raw.trim();
    if (!trimmed.toLowerCase().startsWith(parentPrefix)) continue;
    if (trimmed.slice(parentPrefix.length).trim() !== parentText) continue;

    const parentIndent = raw.search(/\S/);
    // `actor:` must be at root level (indent 0) — same as `goal:`.
    // All other child keywords are indented one unit deeper than their parent.
    const childIndent = childKeyword === "actor" ? 0 : parentIndent + indentUnit;
    const childIndentStr = " ".repeat(childIndent);
    // For goal→actor: actors sit at indent 0 (same as goal), so subtreeEnd
    // would stop at the first actor line. Instead scan the whole block to find
    // the last line that belongs to the goal's logical subtree (everything up
    // to the closing fence).
    const subtreeLast = childKeyword === "actor"
      ? (() => {
          let last = ln;
          for (let i = ln + 1; i <= lineEnd; i++) {
            const t = editor.getLine(i).trim();
            if (t.startsWith("```")) break;
            last = i;
          }
          return last;
        })()
      : subtreeEnd(editor, ln, parentIndent, lineEnd);

    // Collect all existing node values so the new child gets a unique name.
    const existingTexts = new Set<string>();
    for (let i = lineStart; i <= lineEnd; i++) {
      const t = editor.getLine(i).trim();
      for (const kw of ["goal", "actor", "impact", "deliverable", "title"]) {
        if (t.toLowerCase().startsWith(`${kw}:`)) {
          existingTexts.add(t.slice(kw.length + 1).trim().toLowerCase());
          break;
        }
      }
    }
    let childText = newChildText;
    if (existingTexts.has(childText.toLowerCase())) {
      let idx = 2;
      while (existingTexts.has(`${childText} ${idx}`.toLowerCase())) idx++;
      childText = `${childText} ${idx}`;
    }

    editorWrite(() => editor.replaceRange(
      `${childIndentStr}${childKeyword}: ${childText}\n`,
      { line: subtreeLast + 1, ch: 0 },
    ), el);
    return true;
  }

  console.warn(`Vizardry: addImpactChild — ${parentKeyword}: "${parentText}" not found in source`);
  return false;
}

// ── Delete ───────────────────────────────────────────────────────────────────

/**
 * Deletes an Impact Map node and its entire subtree (all more-indented lines).
 * Refuses to delete the goal (level 0) — it is the mandatory root.
 */
export function deleteImpactNode(
  app: App,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  level: number,
  nodeText: string,
): boolean {
  if (level === 0) {
    console.warn("Vizardry: deleteImpactNode — cannot delete the goal node");
    return false;
  }

  const keyword = LEVEL_KEYWORD[level];
  if (!keyword) return false;

  const access = getEditorAccess(app, ctx, el, "deleteImpactNode");
  if (!access) return false;
  const { editor, lineStart, lineEnd } = access;

  const prefix = `${keyword}:`;
  for (let ln = lineStart; ln <= lineEnd; ln++) {
    const raw = editor.getLine(ln);
    const trimmed = raw.trim();
    if (!trimmed.toLowerCase().startsWith(prefix)) continue;
    if (trimmed.slice(prefix.length).trim() !== nodeText) continue;

    const nodeIndent = raw.search(/\S/);
    const last = subtreeEnd(editor, ln, nodeIndent, lineEnd);
    deleteLines(editor, ln, last, el);
    return true;
  }

  console.warn(`Vizardry: deleteImpactNode — ${keyword}: "${nodeText}" not found in source`);
  return false;
}
