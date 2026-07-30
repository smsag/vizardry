/**
 * In-place source edits for the SCQA / SCR narrative canvas.
 *
 * Source format (keyword-per-level, strict-nesting — see keyword-tree.ts):
 *   situation: Revenue is flat
 *     complication: A competitor undercuts us
 *       question: How do we defend share?      (scqa)
 *         answer: Bundle services              (scqa — several allowed)
 *       resolution: Launch a loyalty programme (scr — several allowed)
 *
 * Rename / add / delete run on the shared keyword-tree engine. The level
 * keyword for depth 2+ depends on the variant (scqa: question/answer; scr:
 * resolution), so the callers thread the variant in. Reorder — used only by
 * the grid view's drag — is SCQA-specific and stays here as a pure line-array
 * transform (`reorderSCQAInterior`), tolerant of both the keyword form and
 * legacy bare-indent lines.
 */

import type { App, MarkdownPostProcessorContext } from "obsidian";
import { getEditorAccess, editorWrite } from "./tree-editor-access";
import { renameKeywordTreeNode, addKeywordTreeChild, deleteKeywordTreeNode } from "./keyword-tree-edit";
import type { KeywordTreeConfig } from "./keyword-tree-edit";
import type { SCQAVariant } from "../types";

function configFor(variant: SCQAVariant): KeywordTreeConfig {
  return variant === "scqa"
    ? { levelKeyword: { 0: "situation", 1: "complication", 2: "question", 3: "answer" }, strictNesting: true }
    : { levelKeyword: { 0: "situation", 1: "complication", 2: "resolution" }, strictNesting: true };
}

// ── Rename ───────────────────────────────────────────────────────────────────

export function renameSCQANode(
  app: App, ctx: MarkdownPostProcessorContext, el: HTMLElement,
  variant: SCQAVariant, level: number, oldText: string, newText: string,
): boolean {
  return renameKeywordTreeNode(app, ctx, el, configFor(variant), level, oldText, newText);
}

// ── Add child ────────────────────────────────────────────────────────────────

export function addSCQAChild(
  app: App, ctx: MarkdownPostProcessorContext, el: HTMLElement,
  variant: SCQAVariant, parentLevel: number, parentText: string, newChildText: string,
): boolean {
  return addKeywordTreeChild(app, ctx, el, configFor(variant), parentLevel, parentText, newChildText);
}

// ── Delete ───────────────────────────────────────────────────────────────────

export function deleteSCQANode(
  app: App, ctx: MarkdownPostProcessorContext, el: HTMLElement,
  variant: SCQAVariant, level: number, nodeText: string,
): boolean {
  return deleteKeywordTreeNode(app, ctx, el, configFor(variant), level, nodeText);
}

// ── Reorder (grid drag) ──────────────────────────────────────────────────────

/** Strips a leading level keyword (`complication:` etc.) if present, so node
 *  matching works for both the keyword form and legacy bare-indent lines. */
function nodeValue(trimmed: string): string {
  const m = /^(situation|complication|question|answer|resolution):\s*/i.exec(trimmed);
  return m ? trimmed.slice(m[0].length) : trimmed;
}

export function reorderSCQANode(
  app: App,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  nodeText: string,
  targetIndex: number,
): boolean {
  const access = getEditorAccess(app, ctx, el, "reorderSCQANode");
  if (!access) return false;
  const { editor, lineStart, lineEnd } = access;

  const interior: string[] = [];
  for (let ln = lineStart + 1; ln < lineEnd; ln++) interior.push(editor.getLine(ln));

  const next = reorderSCQAInterior(interior, nodeText, targetIndex);
  if (!next) return false;

  editorWrite(() => editor.replaceRange(
    next.length ? next.join("\n") + "\n" : "",
    { line: lineStart + 1, ch: 0 }, { line: lineEnd, ch: 0 },
  ), el);
  return true;
}

/**
 * Pure reorder: moves the subtree rooted at `nodeText` to `targetIndex` within
 * its sibling group, preserving every other line (config, comments, blanks).
 * Returns the new interior line array, or null when the move is a no-op or the
 * node isn't found. `nodeText` is the node's value with its keyword stripped;
 * lines are matched the same way so keyword and legacy blocks both work.
 */
export function reorderSCQAInterior(
  lines: string[],
  nodeText: string,
  targetIndex: number,
): string[] | null {
  const indentOf = (s: string): number => {
    const t = s.trim();
    if (t === "" || t.startsWith("//")) return -1;
    return s.search(/\S/);
  };

  // Locate the dragged node (skip the situation root at indent 0).
  let nodeLine = -1;
  for (let i = 0; i < lines.length; i++) {
    const ind = indentOf(lines[i]);
    if (ind <= 0) continue;
    if (nodeValue(lines[i].trim()) === nodeText) { nodeLine = i; break; }
  }
  if (nodeLine === -1) return null;

  const nodeIndent = indentOf(lines[nodeLine]);

  // Subtree = node line through the last line before the next meaningful line
  // at indent <= nodeIndent (a sibling or an ancestor's branch).
  let subtreeEndLine = lines.length - 1;
  for (let i = nodeLine + 1; i < lines.length; i++) {
    const ind = indentOf(lines[i]);
    if (ind !== -1 && ind <= nodeIndent) { subtreeEndLine = i - 1; break; }
  }

  // Parent = nearest preceding meaningful line with a shallower indent.
  let parentLine = -1;
  for (let i = nodeLine - 1; i >= 0; i--) {
    const ind = indentOf(lines[i]);
    if (ind !== -1 && ind < nodeIndent) { parentLine = i; break; }
  }

  // Sibling group = meaningful lines at exactly nodeIndent under that parent,
  // stopping at the first meaningful line shallower than nodeIndent.
  const siblings: number[] = [];
  for (let i = parentLine + 1; i < lines.length; i++) {
    const ind = indentOf(lines[i]);
    if (ind === -1) continue;
    if (ind < nodeIndent) break;
    if (ind === nodeIndent) siblings.push(i);
  }

  const currentIndex = siblings.indexOf(nodeLine);
  if (currentIndex === -1) return null;

  const clamped = Math.max(0, Math.min(targetIndex, siblings.length));
  if (clamped === currentIndex || clamped === currentIndex + 1) return null;

  const block = lines.slice(nodeLine, subtreeEndLine + 1);
  const withoutBlock = [...lines.slice(0, nodeLine), ...lines.slice(subtreeEndLine + 1)];

  // Where does the sibling at `clamped` now start, after removing the block?
  let insertAt: number;
  if (clamped >= siblings.length) {
    // Append after the last remaining sibling's subtree.
    const lastSibling = siblings[siblings.length - 1] === nodeLine
      ? siblings[siblings.length - 2]
      : siblings[siblings.length - 1];
    const adjusted = lastSibling > subtreeEndLine ? lastSibling - block.length : lastSibling;
    let end = withoutBlock.length;
    for (let i = adjusted + 1; i < withoutBlock.length; i++) {
      const ind = indentOf(withoutBlock[i]);
      if (ind !== -1 && ind <= nodeIndent) { end = i; break; }
    }
    insertAt = end;
  } else {
    const targetSiblingLine = siblings[clamped];
    insertAt = targetSiblingLine > subtreeEndLine ? targetSiblingLine - block.length : targetSiblingLine;
  }

  return [...withoutBlock.slice(0, insertAt), ...block, ...withoutBlock.slice(insertAt)];
}
