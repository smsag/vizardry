/**
 * Shared parser for the "keyword-per-level" strict-nesting tree family —
 * OST (outcome/opportunity/solution/experiment) and SCQA / SCR
 * (situation/complication/question/answer | resolution).
 *
 * Every node line carries its own level keyword, exactly like the Impact Map
 * (goal/actor/impact/deliverable) — the canonical form this family follows:
 *
 *   outcome: Increase activation
 *     need: Users don't grasp the value
 *       solution: Add an interactive tour
 *         experiment: A/B test tour vs. video
 *
 * A node attaches to the most-recent node one level up (so an opportunity may
 * hold several solutions, a solution several experiments, and so on), and its
 * keyword must match the required parent's level — a `solution:` only ever
 * nests under an opportunity. Indentation must place each child under its
 * parent, mirroring the Impact Map parser's validation.
 *
 * A single level may accept several keywords via `aliases` (OST's Opportunity
 * lane accepts `need:`, `pain:` and `desire:`); each parsed node records the
 * exact keyword it was authored with in `key`.
 *
 * When `allowBullets` is set, a bare (keyword-less) indented line is not an
 * error — it becomes a bullet on the nearest enclosing node (`bullets`).
 *
 * Back-compat: blocks authored before this syntax used a single root keyword
 * plus bare indented lines whose level came only from indentation. When NO
 * non-root line carries a recognised level keyword (and bullets are not
 * enabled), the block is parsed that legacy way instead (via buildIndentTree)
 * so existing vault notes keep rendering unchanged.
 */

import {
  buildIndentTree,
  detectIndentUnit,
  extractMeaningfulLines,
  type IndentLine,
} from "./indent-tree";

export interface KwTreeNode {
  text: string;
  level: number;
  /** The exact keyword matched for this node ("" for legacy bare-indent nodes). */
  key: string;
  /** Bare indented lines nested under this node (only when allowBullets). */
  bullets: string[];
  children: KwTreeNode[];
}

export interface KwTreeOptions {
  /** Extra accepted keywords per level, e.g. { 1: ["pain", "desire"] }. */
  aliases?: Record<number, string[]>;
  /** Treat bare indented lines as bullets on the enclosing node (strict form). */
  allowBullets?: boolean;
  /** Never fall back to the legacy bare-indent parse — always parse as the
   *  keyword form. OST sets this (it dropped legacy); SCQA leaves it off so
   *  keyword-less legacy blocks still parse structurally. */
  forceStrict?: boolean;
}

export type KwTreeResult =
  | { ok: true; root: KwTreeNode; warnings?: string[] }
  | { ok: false; error: string };

/** Shown in place of an empty node label so the node still renders visibly. */
export const EMPTY_LABEL_PLACEHOLDER = "(empty)";

interface KwEntry { kw: string; level: number; }

/** All non-root keyword→level entries (canonical keywords + aliases). */
function keywordEntries(levels: string[], aliases?: Record<number, string[]>): KwEntry[] {
  const entries: KwEntry[] = [];
  for (let k = 1; k < levels.length; k++) {
    entries.push({ kw: levels[k], level: k });
    for (const a of aliases?.[k] ?? []) entries.push({ kw: a, level: k });
  }
  return entries;
}

/**
 * Returns the matched keyword entry when `text` starts with `keyword:`, or
 * null when none does. The root keyword (index 0) is intentionally excluded —
 * a second root line is handled as a duplicate-root error, not as a child.
 */
function recognise(text: string, entries: KwEntry[]): KwEntry | null {
  const lower = text.toLowerCase();
  for (const e of entries) {
    if (lower.startsWith(`${e.kw}:`)) return e;
  }
  return null;
}

/** Human-readable list of the accepted non-root keywords, e.g. `need:`, `solution:`. */
function childKeywordList(entries: KwEntry[]): string {
  return entries.map(e => `"${e.kw}:"`).join(", ");
}

/**
 * Parses a keyword-per-level tree. `levels[0]` is the required root keyword;
 * `levels[k]` is the canonical keyword for depth k. Node text has its keyword
 * stripped.
 */
export function parseKeywordTree(source: string, levels: string[], opts: KwTreeOptions = {}): KwTreeResult {
  const rootKw = levels[0];
  const entries = keywordEntries(levels, opts.aliases);
  const meaningful = extractMeaningfulLines(source);
  const warnings: string[] = [];

  // Fatal: there is genuinely nothing to anchor a tree on.
  if (meaningful.length === 0) {
    return { ok: false, error: `Missing required "${rootKw}:" field` };
  }

  const first = meaningful[0];
  if (!first.text.toLowerCase().startsWith(`${rootKw}:`)) {
    return { ok: false, error: `Line ${first.lineNum}: first line must be "${rootKw}: <text>"` };
  }
  if (first.indent !== 0) {
    return { ok: false, error: `Line ${first.lineNum}: "${rootKw}:" must be at indent level 0` };
  }

  // Recoverable: an empty root label renders as a placeholder node rather than
  // blanking the whole canvas.
  let rootText = first.text.slice(rootKw.length + 1).trim();
  if (!rootText) {
    warnings.push(`Line ${first.lineNum}: "${rootKw}:" has no text — showing an empty node`);
    rootText = "";
  }

  // Recoverable: extra root lines are ignored (first one wins) rather than fatal.
  const rest: IndentLine[] = [];
  for (let i = 1; i < meaningful.length; i++) {
    const m = meaningful[i];
    if (m.indent === 0 && m.text.toLowerCase().startsWith(`${rootKw}:`)) {
      warnings.push(`Line ${m.lineNum}: duplicate "${rootKw}:" ignored — only the first is used`);
      continue;
    }
    rest.push(m);
  }

  // Detect the format: keyword-per-level (canonical) vs. legacy bare-indent.
  // forceStrict pins the keyword form (OST); otherwise a keyword-less block is
  // treated as legacy, so SCQA's bare-indent notes keep parsing structurally.
  const hasKeywords = rest.some(l => recognise(l.text, entries) !== null);

  const res = (hasKeywords || opts.forceStrict)
    ? parseStrict([first, ...rest], entries, rootKw, rootText, opts)
    : parseLegacy([first, ...rest], levels, rootText);
  if (!res.ok) return res;
  return { ok: true, root: res.root, warnings: [...warnings, ...(res.warnings ?? [])] };
}

/** Canonical form: each line's keyword sets its level; the chain is validated. */
function parseStrict(
  meaningful: IndentLine[],
  entries: KwEntry[],
  rootKw: string,
  rootText: string,
  opts: KwTreeOptions,
): KwTreeResult {
  const warnings: string[] = [];
  const root: KwTreeNode = { text: rootText, level: 0, key: rootKw, bullets: [], children: [] };
  const stack: Array<{ level: number; indent: number; node: KwTreeNode }> = [
    { level: 0, indent: 0, node: root },
  ];

  for (let i = 1; i < meaningful.length; i++) {
    const { indent, text, lineNum } = meaningful[i];

    const entry = recognise(text, entries);
    if (!entry) {
      if (opts.allowBullets) {
        // Bare line → bullet on the nearest enclosing (less-indented) node.
        while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop();
        stack[stack.length - 1].node.bullets.push(text);
        continue;
      }
      return {
        ok: false,
        error: `Line ${lineNum}: unexpected content — every node must start with one of ${childKeywordList(entries)}`,
      };
    }

    const { kw, level } = entry;
    // Recoverable: an empty label renders as a placeholder node.
    let label = text.slice(kw.length + 1).trim();
    if (!label) {
      warnings.push(`Line ${lineNum}: "${kw}:" has no text — showing an empty node`);
      label = "";
    }

    while (stack.length > 1 && stack[stack.length - 1].level >= level) stack.pop();
    const parent = stack[stack.length - 1];

    // Recoverable: a mis-nested or mis-indented node is skipped (with a
    // warning) instead of aborting the whole render. Its descendants then
    // reattach to a valid ancestor or are skipped too.
    if (parent.level !== level - 1) {
      const parentKw = level - 1 === 0 ? rootKw : parentKeyword(entries, level - 1);
      warnings.push(`Line ${lineNum}: "${kw}:" isn't nested under a "${parentKw}:" — skipped`);
      continue;
    }
    if (indent <= parent.indent) {
      const parentKw = level - 1 === 0 ? rootKw : parentKeyword(entries, level - 1);
      warnings.push(`Line ${lineNum}: "${kw}:" isn't indented under its "${parentKw}:" — skipped`);
      continue;
    }

    const node: KwTreeNode = { text: label, level, key: kw, bullets: [], children: [] };
    parent.node.children.push(node);
    stack.push({ level, indent, node });
  }

  return { ok: true, root, warnings };
}

/** The canonical (first-declared) keyword for a level, for error messages. */
function parentKeyword(entries: KwEntry[], level: number): string {
  return entries.find(e => e.level === level)?.kw ?? "";
}

/** Legacy form: bare indented lines, level derived purely from indentation. */
function parseLegacy(meaningful: IndentLine[], levels: string[], rootText: string): KwTreeResult {
  const indentUnit = detectIndentUnit(meaningful);
  const treeLines = [{ ...meaningful[0], text: rootText }, ...meaningful.slice(1)];
  const makeNode = (text: string, level: number): KwTreeNode =>
    ({ text, level, key: "", bullets: [], children: [] });
  return buildIndentTree<KwTreeNode>(treeLines, indentUnit, makeNode, levels.length - 1);
}
