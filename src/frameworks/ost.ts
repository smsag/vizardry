import type { OSTNode, OSTResult} from "../types";
import { OSTTree } from "../types";
import { buildIndentTree, detectIndentUnit, extractMeaningfulLines } from "../shared/indent-tree";

export function parseOST(source: string): OSTResult {
  const meaningful = extractMeaningfulLines(source);

  if (meaningful.length === 0) {
    return { ok: false, error: 'Missing required "outcome:" field' };
  }

  const first = meaningful[0];
  if (!first.text.startsWith("outcome:")) {
    return { ok: false, error: `Line ${first.lineNum}: first line must be "outcome: <text>"` };
  }
  if (first.indent !== 0) {
    return { ok: false, error: `Line ${first.lineNum}: "outcome:" must be at indent level 0` };
  }

  const rootText = first.text.slice("outcome:".length).trim();
  if (!rootText) {
    return { ok: false, error: `Line ${first.lineNum}: "outcome:" must have a non-empty label` };
  }

  for (let i = 1; i < meaningful.length; i++) {
    if (meaningful[i].indent === 0 && meaningful[i].text.startsWith("outcome:")) {
      return { ok: false, error: `Line ${meaningful[i].lineNum}: duplicate "outcome:" — only one outcome is allowed` };
    }
  }

  const indentUnit = detectIndentUnit(meaningful);
  const treeLines = [{ ...meaningful[0], text: rootText }, ...meaningful.slice(1)];

  const makeNode = (text: string, level: number): OSTNode => ({
    text, level, children: [],
  });

  const result = buildIndentTree<OSTNode>(treeLines, indentUnit, makeNode, 4);

  if (!result.ok) return result;
  return { ok: true, data: { root: result.root } };
}
