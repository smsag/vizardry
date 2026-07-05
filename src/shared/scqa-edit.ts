/**
 * In-place source edits for the SCQA / SCR narrative canvas.
 *
 * Rename / add / delete mirror the OST edit module (shared indent-tree family),
 * with `situation:` as the root keyword. Reorder — used only by the grid view's
 * drag — is implemented as a pure line-array transform (`reorderSCQAInterior`)
 * so it is unit-testable without an editor, then applied by `reorderSCQANode`.
 *
 * All functions follow the wardley-edit.ts pattern: resolve the live editor,
 * locate target line(s) by text within the block bounds, write back, and
 * return true on success / false on failure.
 */

import type { App, MarkdownPostProcessorContext } from "obsidian";
import {
  getEditorAccess,
  detectIndentUnit,
  subtreeEnd,
  deleteLines,
  editorWrite,
} from "./tree-editor-access";

// ── Rename ───────────────────────────────────────────────────────────────────

export function renameSCQANode(
  app: App,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  oldText: string,
  newText: string,
): boolean {
  if (!newText.trim() || newText === oldText) return false;

  const access = getEditorAccess(app, ctx, el, "renameSCQANode");
  if (!access) return false;
  const { editor, lineStart, lineEnd } = access;

  for (let ln = lineStart; ln <= lineEnd; ln++) {
    const raw = editor.getLine(ln);
    const trimmed = raw.trim();

    const rootMatch = trimmed.match(/^situation:\s*(.+)$/i);
    if (rootMatch && rootMatch[1].trim() === oldText) {
      const indentStr = raw.slice(0, raw.search(/\S/));
      editorWrite(() => editor.replaceRange(
        `${indentStr}situation: ${newText}`,
        { line: ln, ch: 0 }, { line: ln, ch: raw.length },
      ), el);
      return true;
    }

    if (trimmed === oldText && !trimmed.toLowerCase().startsWith("situation:")) {
      const indentStr = raw.slice(0, raw.search(/\S/));
      editorWrite(() => editor.replaceRange(
        `${indentStr}${newText}`,
        { line: ln, ch: 0 }, { line: ln, ch: raw.length },
      ), el);
      return true;
    }
  }

  console.warn(`Vizardry: renameSCQANode — "${oldText}" not found in source`);
  return false;
}

// ── Add child ────────────────────────────────────────────────────────────────

export function addSCQAChild(
  app: App,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  parentText: string,
  newChildText: string,
): boolean {
  const access = getEditorAccess(app, ctx, el, "addSCQAChild");
  if (!access) return false;
  const { editor, lineStart, lineEnd } = access;

  const indentUnit = detectIndentUnit(editor, lineStart, lineEnd);

  for (let ln = lineStart; ln <= lineEnd; ln++) {
    const raw = editor.getLine(ln);
    const trimmed = raw.trim();

    const isRoot = /^situation:\s*/i.test(trimmed) && trimmed.replace(/^situation:\s*/i, "").trim() === parentText;
    const isPlain = trimmed === parentText && !trimmed.toLowerCase().startsWith("situation:");
    if (!isRoot && !isPlain) continue;

    const parentIndent = raw.search(/\S/);
    const childIndentStr = " ".repeat(parentIndent + indentUnit);
    const subtreeLast = subtreeEnd(editor, ln, parentIndent, lineEnd);

    // Ensure the new child's text is unique so later rename/delete can match it.
    const existing = new Set<string>();
    for (let i = lineStart + 1; i < lineEnd; i++) {
      const t = editor.getLine(i).trim();
      if (t && !t.startsWith("//") && !t.startsWith("```") && !/^situation:/i.test(t)) {
        existing.add(t.toLowerCase());
      }
    }
    let childText = newChildText;
    if (existing.has(childText.toLowerCase())) {
      let idx = 2;
      while (existing.has(`${childText} ${idx}`.toLowerCase())) idx++;
      childText = `${childText} ${idx}`;
    }

    editorWrite(() => editor.replaceRange(
      `${childIndentStr}${childText}\n`,
      { line: subtreeLast + 1, ch: 0 },
    ), el);
    return true;
  }

  console.warn(`Vizardry: addSCQAChild — parent "${parentText}" not found in source`);
  return false;
}

// ── Delete ───────────────────────────────────────────────────────────────────

export function deleteSCQANode(
  app: App,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  nodeText: string,
): boolean {
  const access = getEditorAccess(app, ctx, el, "deleteSCQANode");
  if (!access) return false;
  const { editor, lineStart, lineEnd } = access;

  for (let ln = lineStart; ln <= lineEnd; ln++) {
    const raw = editor.getLine(ln);
    const trimmed = raw.trim();

    const isRoot = /^situation:\s*/i.test(trimmed) && trimmed.replace(/^situation:\s*/i, "").trim() === nodeText;
    const isPlain = trimmed === nodeText && !trimmed.toLowerCase().startsWith("situation:");
    if (!isRoot && !isPlain) continue;

    if (isRoot) {
      console.warn("Vizardry: deleteSCQANode — cannot delete the situation root");
      return false;
    }

    const nodeIndent = raw.search(/\S/);
    const last = subtreeEnd(editor, ln, nodeIndent, lineEnd);
    deleteLines(editor, ln, last, el);
    return true;
  }

  console.warn(`Vizardry: deleteSCQANode — "${nodeText}" not found in source`);
  return false;
}

// ── Reorder (grid drag) ──────────────────────────────────────────────────────

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
 * node isn't found.
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
    if (lines[i].trim() === nodeText) { nodeLine = i; break; }
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
