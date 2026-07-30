/**
 * Shared parser for the "keyword-per-level" strict-nesting tree family —
 * OST (outcome/opportunity/solution/experiment/assumption) and SCQA / SCR
 * (situation/complication/question/answer | resolution).
 *
 * Every node line carries its own level keyword, exactly like the Impact Map
 * (goal/actor/impact/deliverable) — the canonical form this family follows:
 *
 *   outcome: Increase activation
 *     opportunity: Users don't grasp the value
 *       solution: Add an interactive tour
 *         experiment: A/B test tour vs. video
 *           assumption: Users prefer guided tours
 *
 * A node attaches to the most-recent node one level up (so an opportunity may
 * hold several solutions, a solution several experiments, and so on), and its
 * keyword must match the required parent's level — a `solution:` only ever
 * nests under an `opportunity:`. Indentation must place each child under its
 * parent, mirroring the Impact Map parser's validation.
 *
 * Back-compat: blocks authored before this syntax used a single root keyword
 * plus bare indented lines whose level came only from indentation. When NO
 * non-root line carries a recognised level keyword, the block is parsed that
 * legacy way instead (via buildIndentTree) so existing vault notes keep
 * rendering unchanged. The insert templates and docs use the keyword form.
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
  children: KwTreeNode[];
}

export type KwTreeResult =
  | { ok: true; root: KwTreeNode }
  | { ok: false; error: string };

/**
 * Returns the level index (1..n-1) whose keyword prefixes `text`, or -1 when
 * none does. The root keyword (index 0) is intentionally excluded — a second
 * root line is handled as a duplicate-root error, not as a child.
 */
function recognisedLevel(text: string, levels: string[]): number {
  const lower = text.toLowerCase();
  for (let k = 1; k < levels.length; k++) {
    if (lower.startsWith(`${levels[k]}:`)) return k;
  }
  return -1;
}

/** Human-readable list of the non-root keywords, e.g. `opportunity:`, `solution:`. */
function childKeywordList(levels: string[]): string {
  return levels.slice(1).map(k => `"${k}:"`).join(", ");
}

/**
 * Parses a keyword-per-level tree. `levels[0]` is the required root keyword;
 * `levels[k]` is the keyword for depth k. Node text has its keyword stripped.
 */
export function parseKeywordTree(source: string, levels: string[]): KwTreeResult {
  const rootKw = levels[0];
  const meaningful = extractMeaningfulLines(source);

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

  const rootText = first.text.slice(rootKw.length + 1).trim();
  if (!rootText) {
    return { ok: false, error: `Line ${first.lineNum}: "${rootKw}:" must have a non-empty label` };
  }

  for (let i = 1; i < meaningful.length; i++) {
    if (meaningful[i].indent === 0 && meaningful[i].text.toLowerCase().startsWith(`${rootKw}:`)) {
      return { ok: false, error: `Line ${meaningful[i].lineNum}: duplicate "${rootKw}:" — only one is allowed` };
    }
  }

  // Detect the format: keyword-per-level (canonical) vs. legacy bare-indent.
  const hasKeywords = meaningful.slice(1).some(l => recognisedLevel(l.text, levels) !== -1);

  return hasKeywords
    ? parseStrict(meaningful, levels, rootText)
    : parseLegacy(meaningful, levels, rootText);
}

/** Canonical form: each line's keyword sets its level; the chain is validated. */
function parseStrict(meaningful: IndentLine[], levels: string[], rootText: string): KwTreeResult {
  const root: KwTreeNode = { text: rootText, level: 0, children: [] };
  const stack: Array<{ level: number; indent: number; node: KwTreeNode }> = [
    { level: 0, indent: 0, node: root },
  ];

  for (let i = 1; i < meaningful.length; i++) {
    const { indent, text, lineNum } = meaningful[i];

    const level = recognisedLevel(text, levels);
    if (level === -1) {
      return {
        ok: false,
        error: `Line ${lineNum}: unexpected content — every node must start with one of ${childKeywordList(levels)}`,
      };
    }

    const label = text.slice(levels[level].length + 1).trim();
    if (!label) {
      return { ok: false, error: `Line ${lineNum}: "${levels[level]}:" must have a non-empty label` };
    }

    while (stack.length > 1 && stack[stack.length - 1].level >= level) stack.pop();
    const parent = stack[stack.length - 1];

    if (parent.level !== level - 1) {
      return {
        ok: false,
        error: `Line ${lineNum}: "${levels[level]}:" must be nested under a "${levels[level - 1]}:"`,
      };
    }
    if (indent <= parent.indent) {
      return {
        ok: false,
        error: `Line ${lineNum}: "${levels[level]}:" must be indented under its "${levels[level - 1]}:"`,
      };
    }

    const node: KwTreeNode = { text: label, level, children: [] };
    parent.node.children.push(node);
    stack.push({ level, indent, node });
  }

  return { ok: true, root };
}

/** Legacy form: bare indented lines, level derived purely from indentation. */
function parseLegacy(meaningful: IndentLine[], levels: string[], rootText: string): KwTreeResult {
  const indentUnit = detectIndentUnit(meaningful);
  const treeLines = [{ ...meaningful[0], text: rootText }, ...meaningful.slice(1)];
  const makeNode = (text: string, level: number): KwTreeNode => ({ text, level, children: [] });
  return buildIndentTree<KwTreeNode>(treeLines, indentUnit, makeNode, levels.length - 1);
}
