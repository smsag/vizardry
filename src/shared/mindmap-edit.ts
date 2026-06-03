/**
 * In-place source edits for the Mind Map canvas.
 *
 * Source format (indent-based, root keyword only):
 *   root: Central Idea
 *     Branch One
 *       Leaf A
 *     Branch Two
 *
 * All functions follow the wardley-edit.ts pattern:
 *   - Resolve the live editor via getEditorAccess()
 *   - Locate target line(s) by text matching within the block bounds
 *   - Write back with editor.replaceRange()
 *   - Return true on success, false on failure
 */

import type { App, MarkdownPostProcessorContext } from "obsidian";
import {
  getEditorAccess,
  detectIndentUnit,
  subtreeEnd,
  deleteLines,
} from "./tree-editor-access";

// ── Rename ───────────────────────────────────────────────────────────────────

/**
 * Renames a Mind Map node in-place.
 * For the root node the line starts with "root: "; all other nodes are
 * plain indented text with no keyword prefix.
 */
export function renameMindMapNode(
  app: App,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  oldText: string,
  newText: string,
): boolean {
  if (!newText.trim() || newText === oldText) return false;

  const access = getEditorAccess(app, ctx, el, "renameMindMapNode");
  if (!access) return false;
  const { editor, lineStart, lineEnd } = access;

  for (let ln = lineStart; ln <= lineEnd; ln++) {
    const raw = editor.getLine(ln);
    const trimmed = raw.trim();

    // Root line: "root: <text>"
    const rootMatch = trimmed.match(/^root:\s*(.+)$/i);
    if (rootMatch && rootMatch[1].trim() === oldText) {
      const indentStr = raw.slice(0, raw.search(/\S/));
      editor.replaceRange(
        `${indentStr}root: ${newText}`,
        { line: ln, ch: 0 }, { line: ln, ch: raw.length },
      );
      return true;
    }

    // Non-root line: plain indented text
    if (trimmed === oldText && !trimmed.toLowerCase().startsWith("root:")) {
      const indentStr = raw.slice(0, raw.search(/\S/));
      editor.replaceRange(
        `${indentStr}${newText}`,
        { line: ln, ch: 0 }, { line: ln, ch: raw.length },
      );
      return true;
    }
  }

  console.warn(`Vizardry: renameMindMapNode — "${oldText}" not found in source`);
  return false;
}

// ── Add child ────────────────────────────────────────────────────────────────

/**
 * Appends a new child node under the node whose text matches `parentText`.
 * The new line is inserted after the parent's entire subtree, indented by
 * one extra level relative to the parent.
 */
export function addMindMapChild(
  app: App,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  parentText: string,
  newChildText: string,
): boolean {
  const access = getEditorAccess(app, ctx, el, "addMindMapChild");
  if (!access) return false;
  const { editor, lineStart, lineEnd } = access;

  const indentUnit = detectIndentUnit(editor, lineStart, lineEnd);

  for (let ln = lineStart; ln <= lineEnd; ln++) {
    const raw = editor.getLine(ln);
    const trimmed = raw.trim();

    // Match root or plain node
    const isRoot = /^root:\s*/i.test(trimmed) && trimmed.replace(/^root:\s*/i, "").trim() === parentText;
    const isPlain = trimmed === parentText && !trimmed.toLowerCase().startsWith("root:");

    if (!isRoot && !isPlain) continue;

    const parentIndent = raw.search(/\S/);
    const childIndent = parentIndent + indentUnit;
    const childIndentStr = " ".repeat(childIndent);

    const subtreeLast = subtreeEnd(editor, ln, parentIndent, lineEnd);
    const insertAt = subtreeLast + 1;

    editor.replaceRange(
      `${childIndentStr}${newChildText}\n`,
      { line: insertAt, ch: 0 },
    );
    return true;
  }

  console.warn(`Vizardry: addMindMapChild — parent "${parentText}" not found in source`);
  return false;
}

// ── Delete ───────────────────────────────────────────────────────────────────

/**
 * Deletes a Mind Map node and its entire subtree.
 * Only leaf nodes (no children in the rendered tree) are exposed via the
 * UI, but the write function handles subtrees safely regardless.
 */
export function deleteMindMapNode(
  app: App,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  nodeText: string,
): boolean {
  const access = getEditorAccess(app, ctx, el, "deleteMindMapNode");
  if (!access) return false;
  const { editor, lineStart, lineEnd } = access;

  for (let ln = lineStart; ln <= lineEnd; ln++) {
    const raw = editor.getLine(ln);
    const trimmed = raw.trim();

    const isRoot = /^root:\s*/i.test(trimmed) && trimmed.replace(/^root:\s*/i, "").trim() === nodeText;
    const isPlain = trimmed === nodeText && !trimmed.toLowerCase().startsWith("root:");

    if (!isRoot && !isPlain) continue;
    if (isRoot) {
      // Refuse to delete the root — would break the canvas
      console.warn("Vizardry: deleteMindMapNode — cannot delete the root node");
      return false;
    }

    const nodeIndent = raw.search(/\S/);
    const last = subtreeEnd(editor, ln, nodeIndent, lineEnd);
    deleteLines(editor, ln, last);
    return true;
  }

  console.warn(`Vizardry: deleteMindMapNode — "${nodeText}" not found in source`);
  return false;
}
