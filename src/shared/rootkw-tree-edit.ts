/**
 * Shared in-place source editing engine for the "single root keyword" tree
 * family: one `<rootKeyword>: <text>` line at indent 0, every other node is
 * plain indented text with no keyword prefix (Mind Map's "root:", OST's
 * "outcome:", SCQA/SCR's "situation:").
 *
 * Mind Map, OST and SCQA's rename/add/delete are otherwise structurally
 * identical, so this engine is parametrized by a RootKwTreeConfig — see
 * mindmap-edit.ts / ost-edit.ts / scqa-edit.ts for the thin per-framework
 * wrappers. (SCQA's drag-reorder is framework-specific and stays in
 * scqa-edit.ts as a pure line-array transform.)
 *
 * Node identity is resolved by scanning for matching text within the block.
 * Since the source has no stable per-node id, a text value that matches more
 * than once (e.g. the same label appearing under two different branches) is
 * genuinely ambiguous — silently acting on the first match would risk
 * editing or deleting the wrong node. Every locate step therefore counts ALL
 * matches and refuses (with a warning) when there's more than one.
 */

import type { App, Editor, MarkdownPostProcessorContext } from "obsidian";
import { resolveEditor } from "./editor";
import {
  detectIndentUnit,
  subtreeEnd,
  deleteLines,
  editorWrite,
} from "./tree-editor-access";

export interface RootKwTreeConfig {
  /** The root line's keyword, e.g. "root", "outcome", "situation" (case-insensitive). */
  rootKeyword: string;
  /** Deepest level (root = 0) that may have children added. Omit for no limit. */
  maxDepth?: number;
}

interface Match {
  line: number;
  indent: number;
  isRoot: boolean;
}

function rootRe(config: RootKwTreeConfig): RegExp {
  return new RegExp(`^${config.rootKeyword}:\\s*`, "i");
}

/** Finds every line at [lineStart, lineEnd] whose node text (root or plain) matches `text`. */
function findAll(editor: Editor, lineStart: number, lineEnd: number, config: RootKwTreeConfig, text: string): Match[] {
  const re = rootRe(config);
  const matches: Match[] = [];
  for (let ln = lineStart; ln <= lineEnd; ln++) {
    const raw = editor.getLine(ln);
    const trimmed = raw.trim();
    const isRoot = re.test(trimmed);
    const value = isRoot ? trimmed.replace(re, "").trim() : trimmed;
    if (isRoot && value === text) {
      matches.push({ line: ln, indent: raw.search(/\S/), isRoot: true });
    } else if (!isRoot && trimmed === text) {
      matches.push({ line: ln, indent: raw.search(/\S/), isRoot: false });
    }
  }
  return matches;
}

function locateOne(
  editor: Editor, lineStart: number, lineEnd: number,
  config: RootKwTreeConfig, text: string, caller: string,
): Match | null {
  const matches = findAll(editor, lineStart, lineEnd, config, text);
  if (matches.length === 0) {
    console.warn(`Vizardry: ${caller} — "${text}" not found in source`);
    return null;
  }
  if (matches.length > 1) {
    console.warn(`Vizardry: ${caller} — ${matches.length} nodes match "${text}" — refusing to guess which one; give them distinct names to disambiguate`);
    return null;
  }
  return matches[0];
}

// ── Rename ───────────────────────────────────────────────────────────────────

export function renameRootKwTreeNode(
  app: App, ctx: MarkdownPostProcessorContext, el: HTMLElement,
  config: RootKwTreeConfig, oldText: string, newText: string,
): boolean {
  if (!newText.trim() || newText === oldText) return false;

  const access = resolveEditor(app, ctx, el, "renameRootKwTreeNode");
  if (!access) return false;
  const { editor, lineStart, lineEnd } = access;

  const match = locateOne(editor, lineStart, lineEnd, config, oldText, "renameRootKwTreeNode");
  if (!match) return false;

  const raw = editor.getLine(match.line);
  const indentStr = raw.slice(0, match.indent);
  const newLine = match.isRoot ? `${indentStr}${config.rootKeyword}: ${newText}` : `${indentStr}${newText}`;
  editorWrite(() => editor.replaceRange(
    newLine, { line: match.line, ch: 0 }, { line: match.line, ch: raw.length },
  ), el);
  return true;
}

// ── Add child ────────────────────────────────────────────────────────────────

export function addRootKwTreeChild(
  app: App, ctx: MarkdownPostProcessorContext, el: HTMLElement,
  config: RootKwTreeConfig, parentText: string, newChildText: string,
): boolean {
  const access = resolveEditor(app, ctx, el, "addRootKwTreeChild");
  if (!access) return false;
  const { editor, lineStart, lineEnd } = access;

  const parentMatch = locateOne(editor, lineStart, lineEnd, config, parentText, "addRootKwTreeChild");
  if (!parentMatch) return false;

  const indentUnit = detectIndentUnit(editor, lineStart, lineEnd);

  if (config.maxDepth !== undefined) {
    const parentLevel = indentUnit > 0 ? parentMatch.indent / indentUnit : 0;
    if (parentLevel >= config.maxDepth) {
      console.warn(`Vizardry: addRootKwTreeChild — maximum depth (${config.maxDepth}) reached`);
      return false;
    }
  }

  const childIndent = parentMatch.indent + indentUnit;
  const childIndentStr = " ".repeat(childIndent);
  const subtreeLast = subtreeEnd(editor, parentMatch.line, parentMatch.indent, lineEnd);

  // Collect every existing node's text (root + plain) for uniqueness,
  // excluding the root keyword and title lines.
  const rootExcludeRe = new RegExp(`^(${config.rootKeyword}:|title:)`, "i");
  const existingTexts = new Set<string>();
  for (let i = lineStart; i <= lineEnd; i++) {
    const t = editor.getLine(i).trim();
    if (!t || t.startsWith("//") || t.startsWith("```") || rootExcludeRe.test(t)) continue;
    existingTexts.add(t.toLowerCase());
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

// ── Delete ───────────────────────────────────────────────────────────────────

export function deleteRootKwTreeNode(
  app: App, ctx: MarkdownPostProcessorContext, el: HTMLElement,
  config: RootKwTreeConfig, nodeText: string,
): boolean {
  const access = resolveEditor(app, ctx, el, "deleteRootKwTreeNode");
  if (!access) return false;
  const { editor, lineStart, lineEnd } = access;

  const match = locateOne(editor, lineStart, lineEnd, config, nodeText, "deleteRootKwTreeNode");
  if (!match) return false;

  if (match.isRoot) {
    console.warn("Vizardry: deleteRootKwTreeNode — cannot delete the root node");
    return false;
  }

  const last = subtreeEnd(editor, match.line, match.indent, lineEnd);
  deleteLines(editor, match.line, last, el);
  return true;
}
