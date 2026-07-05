/**
 * In-place source edits for the Fishbone (Ishikawa) diagram canvas.
 *
 * Source format (keyword-based, four levels):
 *   effect: Problem statement
 *   category: Technology
 *     cause: API latency
 *       subcause: Slow queries
 *
 * Level keywords:
 *   0 → "effect"    (at indent 0, mandatory root)
 *   1 → "category"  (at indent 0, like "actor" in Impact Map)
 *   2 → "cause"     (indented under category)
 *   3 → "subcause"  (indented under cause)
 *
 * Note: effect and category are both at indent 0 in the source.
 * Hierarchy is tracked structurally, the same way Impact Map handles
 * goal + actor at the same indent level.
 */

import type { App, MarkdownPostProcessorContext } from "obsidian";
import {
  getEditorAccess,
  detectIndentUnit,
  subtreeEnd,
  deleteLines,
  editorWrite,
} from "./tree-editor-access";

export type FishboneLevel = "effect" | "category" | "cause" | "subcause";

/** Maps tree level numbers to source keywords. */
const LEVEL_KEYWORD: Record<number, FishboneLevel> = {
  0: "effect",
  1: "category",
  2: "cause",
  3: "subcause",
};

/** Maps keywords to their child keyword. */
const CHILD_KEYWORD: Partial<Record<FishboneLevel, FishboneLevel>> = {
  effect:   "category",
  category: "cause",
  cause:    "subcause",
};

// ── Rename ───────────────────────────────────────────────────────────────────

/**
 * Renames a Fishbone node at the given tree level.
 */
export function renameFishboneNode(
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

  const access = getEditorAccess(app, ctx, el, "renameFishboneNode");
  if (!access) return false;
  const { editor, lineStart, lineEnd } = access;

  const prefix = `${keyword}:`;
  for (let ln = lineStart; ln <= lineEnd; ln++) {
    const raw = editor.getLine(ln);
    const trimmed = raw.trim();
    if (!trimmed.toLowerCase().startsWith(prefix)) continue;
    if (trimmed.slice(prefix.length).trim() !== oldText) continue;

    const indentStr = raw.slice(0, raw.search(/\S/));
    editorWrite(() => editor.replaceRange(
      `${indentStr}${prefix} ${newText}`,
      { line: ln, ch: 0 }, { line: ln, ch: raw.length },
    ), el);
    return true;
  }

  console.warn(`Vizardry: renameFishboneNode — ${keyword}: "${oldText}" not found in source`);
  return false;
}

// ── Add child ────────────────────────────────────────────────────────────────

/**
 * Appends a new child under the node identified by (level, parentText).
 */
export function addFishboneChild(
  app: App,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  parentLevel: number,
  parentText: string,
  newChildText: string,
): boolean {
  const parentKeyword = LEVEL_KEYWORD[parentLevel];
  const childKeyword = CHILD_KEYWORD[parentKeyword ?? "subcause"];
  if (!parentKeyword || !childKeyword) {
    console.warn("Vizardry: addFishboneChild — subcauses cannot have children");
    return false;
  }

  const access = getEditorAccess(app, ctx, el, "addFishboneChild");
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
    // `category:` must be at root level (indent 0) — same as `effect:`.
    const childIndent = childKeyword === "category" ? 0 : parentIndent + indentUnit;
    const childIndentStr = " ".repeat(childIndent);

    // For effect→category: categories sit at indent 0 (same as effect),
    // so subtreeEnd would stop at the first category line. Scan whole block.
    const subtreeLast = childKeyword === "category"
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

    // Collect all existing node values for uniqueness check.
    const existingTexts = new Set<string>();
    for (let i = lineStart; i <= lineEnd; i++) {
      const t = editor.getLine(i).trim();
      for (const kw of ["effect", "category", "cause", "subcause", "title"]) {
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

  console.warn(`Vizardry: addFishboneChild — ${parentKeyword}: "${parentText}" not found in source`);
  return false;
}

// ── Delete ───────────────────────────────────────────────────────────────────

/**
 * Deletes a Fishbone node and its entire subtree.
 * Refuses to delete the effect (level 0) — it is the mandatory root.
 */
export function deleteFishboneNode(
  app: App,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  level: number,
  nodeText: string,
): boolean {
  if (level === 0) {
    console.warn("Vizardry: deleteFishboneNode — cannot delete the effect node");
    return false;
  }

  const keyword = LEVEL_KEYWORD[level];
  if (!keyword) return false;

  const access = getEditorAccess(app, ctx, el, "deleteFishboneNode");
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

  console.warn(`Vizardry: deleteFishboneNode — ${keyword}: "${nodeText}" not found in source`);
  return false;
}
