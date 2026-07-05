/**
 * In-place source edits for the Opportunity Solution Tree (OST) canvas.
 *
 * Source format (indent-based, outcome keyword only on the root):
 *   outcome: Desired Outcome
 *     Opportunity One
 *       Solution A
 *         Experiment 1
 *           Assumption X
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

// ── Rename ───────────────────────────────────────────────────────────────────

export function renameOSTNode(
  app: App,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  oldText: string,
  newText: string,
): boolean {
  if (!newText.trim() || newText === oldText) return false;

  const access = getEditorAccess(app, ctx, el, "renameOSTNode");
  if (!access) return false;
  const { editor, lineStart, lineEnd } = access;

  for (let ln = lineStart; ln <= lineEnd; ln++) {
    const raw = editor.getLine(ln);
    const trimmed = raw.trim();

    // Root line: "outcome: <text>"
    const rootMatch = trimmed.match(/^outcome:\s*(.+)$/i);
    if (rootMatch && rootMatch[1].trim() === oldText) {
      const indentStr = raw.slice(0, raw.search(/\S/));
      editorWrite(() => editor.replaceRange(
        `${indentStr}outcome: ${newText}`,
        { line: ln, ch: 0 }, { line: ln, ch: raw.length },
      ), el);
      return true;
    }

    // Non-root: plain indented text (no keyword prefix)
    if (trimmed === oldText && !trimmed.toLowerCase().startsWith("outcome:")) {
      const indentStr = raw.slice(0, raw.search(/\S/));
      editorWrite(() => editor.replaceRange(
        `${indentStr}${newText}`,
        { line: ln, ch: 0 }, { line: ln, ch: raw.length },
      ), el);
      return true;
    }
  }

  console.warn(`Vizardry: renameOSTNode — "${oldText}" not found in source`);
  return false;
}

// ── Add child ────────────────────────────────────────────────────────────────

export function addOSTChild(
  app: App,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  parentText: string,
  newChildText: string,
): boolean {
  const access = getEditorAccess(app, ctx, el, "addOSTChild");
  if (!access) return false;
  const { editor, lineStart, lineEnd } = access;

  const indentUnit = detectIndentUnit(editor, lineStart, lineEnd);

  for (let ln = lineStart; ln <= lineEnd; ln++) {
    const raw = editor.getLine(ln);
    const trimmed = raw.trim();

    const isRoot = /^outcome:\s*/i.test(trimmed) && trimmed.replace(/^outcome:\s*/i, "").trim() === parentText;
    const isPlain = trimmed === parentText && !trimmed.toLowerCase().startsWith("outcome:");

    if (!isRoot && !isPlain) continue;

    const parentIndent = raw.search(/\S/);

    // OST enforces max depth 4 (levels 0–4). Level = parentIndent / indentUnit.
    // If the parent is already at level 4 we cannot add children.
    const parentLevel = indentUnit > 0 ? parentIndent / indentUnit : 0;
    if (parentLevel >= 4) {
      console.warn("Vizardry: addOSTChild — maximum depth (4) reached");
      return false;
    }

    const childIndentStr = " ".repeat(parentIndent + indentUnit);
    const subtreeLast = subtreeEnd(editor, ln, parentIndent, lineEnd);

    // Collect all existing node texts so the new child gets a unique name.
    const existingTexts = new Set<string>();
    for (let i = lineStart; i <= lineEnd; i++) {
      const t = editor.getLine(i).trim();
      if (t && !t.startsWith("//") && !t.startsWith("```") && !/^(outcome:|title:)/i.test(t)) {
        existingTexts.add(t.toLowerCase());
      }
    }
    let childText = newChildText;
    if (existingTexts.has(childText.toLowerCase())) {
      let idx = 2;
      while (existingTexts.has(`${childText} ${idx}`.toLowerCase())) idx++;
      childText = `${childText} ${idx}`;
    }

    editorWrite(() => editor.replaceRange(
      `${childIndentStr}${childText}\n`,
      { line: subtreeLast + 1, ch: 0 },
    ), el);
    return true;
  }

  console.warn(`Vizardry: addOSTChild — parent "${parentText}" not found in source`);
  return false;
}

// ── Delete ───────────────────────────────────────────────────────────────────

export function deleteOSTNode(
  app: App,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  nodeText: string,
): boolean {
  const access = getEditorAccess(app, ctx, el, "deleteOSTNode");
  if (!access) return false;
  const { editor, lineStart, lineEnd } = access;

  for (let ln = lineStart; ln <= lineEnd; ln++) {
    const raw = editor.getLine(ln);
    const trimmed = raw.trim();

    const isRoot = /^outcome:\s*/i.test(trimmed) && trimmed.replace(/^outcome:\s*/i, "").trim() === nodeText;
    const isPlain = trimmed === nodeText && !trimmed.toLowerCase().startsWith("outcome:");

    if (!isRoot && !isPlain) continue;
    if (isRoot) {
      console.warn("Vizardry: deleteOSTNode — cannot delete the root outcome");
      return false;
    }

    const nodeIndent = raw.search(/\S/);
    const last = subtreeEnd(editor, ln, nodeIndent, lineEnd);
    deleteLines(editor, ln, last, el);
    return true;
  }

  console.warn(`Vizardry: deleteOSTNode — "${nodeText}" not found in source`);
  return false;
}
