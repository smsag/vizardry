/**
 * Shared in-place source editing engine for the "keyword-per-level" tree
 * family: every level has its own keyword (Fishbone's effect/category/
 * cause/subcause, Impact Map's goal/actor/impact/deliverable). Levels 0 and
 * 1 both sit at root indent (e.g. "effect:" and "category:"); levels 2+ are
 * indented one unit per level under their parent.
 *
 * Fishbone and Impact Map are otherwise structurally identical, so this
 * engine is parametrized entirely by a KeywordTreeConfig — see
 * fishbone-edit.ts / impact-edit.ts for the thin per-framework wrappers.
 *
 * Node identity is resolved by scanning for `keyword: text` within the
 * block. Since the source has no stable per-node id, a (level, text) pair
 * that matches more than once (e.g. two categories each with a "cause: Fix
 * bug" child) is genuinely ambiguous — silently acting on the first match
 * would risk editing or deleting the wrong node. Every locate step therefore
 * counts ALL matches and refuses (with a warning) when there's more than
 * one, rather than guessing.
 */

import type { App, MarkdownPostProcessorContext } from "obsidian";
import {
  getEditorAccess,
  detectIndentUnit,
  subtreeEnd,
  deleteLines,
  editorWrite,
} from "./tree-editor-access";
import type { Editor } from "obsidian";

export interface KeywordTreeConfig {
  /** Canonical keyword for each level, 0-indexed (e.g. {0: "effect", 1:
   *  "category", ...}). Used when INSERTING a new child. */
  levelKeyword: Record<number, string>;
  /** Extra accepted keywords per level (e.g. OST's { 1: ["pain", "desire"] }).
   *  Only affects uniqueness scanning — a node's own keyword is passed in
   *  explicitly by callers that use aliases. */
  levelAliases?: Record<number, string[]>;
  /** When true, EVERY level nests one indent unit under its parent, including
   *  level 1 (OST's outcome→opportunity, SCQA's situation→complication). When
   *  false/omitted, level 1 sits at root indent alongside level 0 (Impact
   *  Map's goal+actor, Fishbone's effect+category). */
  strictNesting?: boolean;
}

/** Every keyword the config recognises (canonical + aliases), lowercased. */
function allKeywords(config: KeywordTreeConfig): string[] {
  const kws = [...Object.values(config.levelKeyword)];
  for (const list of Object.values(config.levelAliases ?? {})) kws.push(...list);
  return kws.map(k => k.toLowerCase());
}

/** A line inside a node's subtree that is not itself a keyword node — i.e. a
 *  bullet. Blank/comment/fence lines are handled by the callers. */
function isBulletLine(trimmed: string, config: KeywordTreeConfig): boolean {
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("title:")) return false;
  return !allKeywords(config).some(kw => lower.startsWith(`${kw}:`));
}

function childKeywordOf(config: KeywordTreeConfig, parentLevel: number): string | undefined {
  return config.levelKeyword[parentLevel + 1];
}

/** True for a child keyword that sits at indent 0, same as the root
 *  (e.g. "category:" under "effect:"). Only the level-1 keyword can, and only
 *  when the config is NOT strict-nesting. */
function childSitsAtRootIndent(config: KeywordTreeConfig, childKeyword: string): boolean {
  return !config.strictNesting && config.levelKeyword[1] === childKeyword;
}

interface Match {
  line: number;
  indent: number;
}

/** Finds every line at [lineStart, lineEnd] matching `keyword: text` exactly. */
function findAll(editor: Editor, lineStart: number, lineEnd: number, keyword: string, text: string): Match[] {
  const prefix = `${keyword}:`;
  const matches: Match[] = [];
  for (let ln = lineStart; ln <= lineEnd; ln++) {
    const raw = editor.getLine(ln);
    const trimmed = raw.trim();
    if (!trimmed.toLowerCase().startsWith(prefix)) continue;
    if (trimmed.slice(prefix.length).trim() !== text) continue;
    matches.push({ line: ln, indent: raw.search(/\S/) });
  }
  return matches;
}

/** Locates exactly one match, warning and returning null if the count is 0 or >1. */
function locateOne(
  editor: Editor, lineStart: number, lineEnd: number,
  keyword: string, text: string, caller: string,
): Match | null {
  const matches = findAll(editor, lineStart, lineEnd, keyword, text);
  if (matches.length === 0) {
    console.warn(`Vizardry: ${caller} — ${keyword}: "${text}" not found in source`);
    return null;
  }
  if (matches.length > 1) {
    console.warn(`Vizardry: ${caller} — ${matches.length} nodes match ${keyword}: "${text}" — refusing to guess which one; give them distinct names to disambiguate`);
    return null;
  }
  return matches[0];
}

// ── Rename ───────────────────────────────────────────────────────────────────

export function renameKeywordTreeNode(
  app: App, ctx: MarkdownPostProcessorContext, el: HTMLElement,
  config: KeywordTreeConfig,
  level: number, oldText: string, newText: string,
  keywordOverride?: string,
): boolean {
  if (!newText.trim() || newText === oldText) return false;

  const keyword = keywordOverride || config.levelKeyword[level];
  if (!keyword) return false;

  const access = getEditorAccess(app, ctx, el, "renameKeywordTreeNode");
  if (!access) return false;
  const { editor, lineStart, lineEnd } = access;

  const match = locateOne(editor, lineStart, lineEnd, keyword, oldText, "renameKeywordTreeNode");
  if (!match) return false;

  const raw = editor.getLine(match.line);
  const indentStr = raw.slice(0, match.indent);
  editorWrite(() => editor.replaceRange(
    `${indentStr}${keyword}: ${newText}`,
    { line: match.line, ch: 0 }, { line: match.line, ch: raw.length },
  ), el);
  return true;
}

// ── Add child ────────────────────────────────────────────────────────────────

export function addKeywordTreeChild(
  app: App, ctx: MarkdownPostProcessorContext, el: HTMLElement,
  config: KeywordTreeConfig,
  parentLevel: number, parentText: string, newChildText: string,
  parentKeywordOverride?: string,
): boolean {
  const parentKeyword = parentKeywordOverride || config.levelKeyword[parentLevel];
  const childKeyword = parentKeyword !== undefined ? childKeywordOf(config, parentLevel) : undefined;
  if (!parentKeyword || !childKeyword) {
    console.warn("Vizardry: addKeywordTreeChild — this level cannot have children");
    return false;
  }

  const access = getEditorAccess(app, ctx, el, "addKeywordTreeChild");
  if (!access) return false;
  const { editor, lineStart, lineEnd } = access;

  const parentMatch = locateOne(editor, lineStart, lineEnd, parentKeyword, parentText, "addKeywordTreeChild");
  if (!parentMatch) return false;

  const indentUnit = detectIndentUnit(editor, lineStart, lineEnd);
  const atRootIndent = childSitsAtRootIndent(config, childKeyword);
  const childIndent = atRootIndent ? 0 : parentMatch.indent + indentUnit;
  const childIndentStr = " ".repeat(childIndent);

  // For a child keyword at root indent (e.g. category under effect), subtreeEnd
  // would stop at the first sibling category line, since it's not "more
  // indented" than the parent. Scan the whole block instead.
  const subtreeLast = atRootIndent
    ? (() => {
        let last = parentMatch.line;
        for (let i = parentMatch.line + 1; i <= lineEnd; i++) {
          const t = editor.getLine(i).trim();
          if (t.startsWith("```")) break;
          last = i;
        }
        return last;
      })()
    : subtreeEnd(editor, parentMatch.line, parentMatch.indent, lineEnd);

  // Collect all existing node values across every level for uniqueness.
  const existingTexts = new Set<string>();
  const uniquenessKeywords = [...allKeywords(config), "title"];
  for (let i = lineStart; i <= lineEnd; i++) {
    const t = editor.getLine(i).trim();
    for (const kw of uniquenessKeywords) {
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

// ── Delete ───────────────────────────────────────────────────────────────────

export function deleteKeywordTreeNode(
  app: App, ctx: MarkdownPostProcessorContext, el: HTMLElement,
  config: KeywordTreeConfig,
  level: number, nodeText: string,
  keywordOverride?: string,
): boolean {
  if (level === 0) {
    console.warn("Vizardry: deleteKeywordTreeNode — cannot delete the root node");
    return false;
  }

  const keyword = keywordOverride || config.levelKeyword[level];
  if (!keyword) return false;

  const access = getEditorAccess(app, ctx, el, "deleteKeywordTreeNode");
  if (!access) return false;
  const { editor, lineStart, lineEnd } = access;

  const match = locateOne(editor, lineStart, lineEnd, keyword, nodeText, "deleteKeywordTreeNode");
  if (!match) return false;

  const last = subtreeEnd(editor, match.line, match.indent, lineEnd);
  deleteLines(editor, match.line, last, el);
  return true;
}

// ── Bullets ────────────────────────────────────────────────────────────────
// A bullet is a bare (keyword-less) line indented one unit under a node. Bullet
// ops locate the owning node by `keyword: text`, then act on its direct bullet
// lines (exact child indent) — never a descendant's bullets.

/** Every direct-bullet line of the node at `nodeLine`, matched by exact indent
 *  and (optionally) exact text. */
function findBulletLines(
  editor: Editor, nodeLine: number, nodeIndent: number, bulletIndent: number,
  lineEnd: number, config: KeywordTreeConfig, text?: string,
): number[] {
  const hits: number[] = [];
  for (let ln = nodeLine + 1; ln <= lineEnd; ln++) {
    const raw = editor.getLine(ln);
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed.startsWith("//")) continue;
    if (trimmed.startsWith("```")) break;
    const indent = raw.search(/\S/);
    if (indent <= nodeIndent) break; // left the node's subtree
    if (indent !== bulletIndent) continue; // deeper — a descendant's content
    if (!isBulletLine(trimmed, config)) continue; // a child keyword node
    if (text === undefined || trimmed === text) hits.push(ln);
  }
  return hits;
}

export function addKeywordTreeBullet(
  app: App, ctx: MarkdownPostProcessorContext, el: HTMLElement,
  config: KeywordTreeConfig,
  nodeKeyword: string, nodeText: string, bulletText: string,
): boolean {
  if (!bulletText.trim()) return false;
  const access = getEditorAccess(app, ctx, el, "addKeywordTreeBullet");
  if (!access) return false;
  const { editor, lineStart, lineEnd } = access;

  const node = locateOne(editor, lineStart, lineEnd, nodeKeyword, nodeText, "addKeywordTreeBullet");
  if (!node) return false;

  const indentUnit = detectIndentUnit(editor, lineStart, lineEnd);
  const bulletIndent = node.indent + indentUnit;
  const existing = findBulletLines(editor, node.line, node.indent, bulletIndent, lineEnd, config);
  // Append after the node's last existing bullet, else right after the node.
  const insertAfter = existing.length > 0 ? existing[existing.length - 1] : node.line;

  editorWrite(() => editor.replaceRange(
    `${" ".repeat(bulletIndent)}${bulletText.trim()}\n`,
    { line: insertAfter + 1, ch: 0 },
  ), el);
  return true;
}

export function editKeywordTreeBullet(
  app: App, ctx: MarkdownPostProcessorContext, el: HTMLElement,
  config: KeywordTreeConfig,
  nodeKeyword: string, nodeText: string, oldBullet: string, newBullet: string,
): boolean {
  if (!newBullet.trim() || newBullet === oldBullet) return false;
  const access = getEditorAccess(app, ctx, el, "editKeywordTreeBullet");
  if (!access) return false;
  const { editor, lineStart, lineEnd } = access;

  const node = locateOne(editor, lineStart, lineEnd, nodeKeyword, nodeText, "editKeywordTreeBullet");
  if (!node) return false;

  const indentUnit = detectIndentUnit(editor, lineStart, lineEnd);
  const bulletIndent = node.indent + indentUnit;
  const hits = findBulletLines(editor, node.line, node.indent, bulletIndent, lineEnd, config, oldBullet);
  if (hits.length !== 1) {
    console.warn(`Vizardry: editKeywordTreeBullet — ${hits.length} bullets match "${oldBullet}" under ${nodeKeyword}: "${nodeText}"`);
    return false;
  }

  const ln = hits[0];
  const raw = editor.getLine(ln);
  editorWrite(() => editor.replaceRange(
    `${" ".repeat(bulletIndent)}${newBullet.trim()}`,
    { line: ln, ch: 0 }, { line: ln, ch: raw.length },
  ), el);
  return true;
}

export function deleteKeywordTreeBullet(
  app: App, ctx: MarkdownPostProcessorContext, el: HTMLElement,
  config: KeywordTreeConfig,
  nodeKeyword: string, nodeText: string, bulletText: string,
): boolean {
  const access = getEditorAccess(app, ctx, el, "deleteKeywordTreeBullet");
  if (!access) return false;
  const { editor, lineStart, lineEnd } = access;

  const node = locateOne(editor, lineStart, lineEnd, nodeKeyword, nodeText, "deleteKeywordTreeBullet");
  if (!node) return false;

  const indentUnit = detectIndentUnit(editor, lineStart, lineEnd);
  const bulletIndent = node.indent + indentUnit;
  const hits = findBulletLines(editor, node.line, node.indent, bulletIndent, lineEnd, config, bulletText);
  if (hits.length !== 1) {
    console.warn(`Vizardry: deleteKeywordTreeBullet — ${hits.length} bullets match "${bulletText}" under ${nodeKeyword}: "${nodeText}"`);
    return false;
  }

  deleteLines(editor, hits[0], hits[0], el);
  return true;
}
