import type { MindMapNode, MindMapResult } from "./types";
import { MindMap } from "./types";
import { buildIndentTree, detectIndentUnit, extractMeaningfulLines } from "./shared/indent-tree";

export function parseMindMap(source: string): MindMapResult {
  const meaningful = extractMeaningfulLines(source);

  if (meaningful.length === 0) {
    return { ok: false, error: 'Missing required "root:" field' };
  }

  const first = meaningful[0];
  if (!first.text.startsWith("root:")) {
    return { ok: false, error: `Line ${first.lineNum}: first line must be "root: <text>"` };
  }
  if (first.indent !== 0) {
    return { ok: false, error: `Line ${first.lineNum}: "root:" must be at indent level 0` };
  }

  const rootText = first.text.slice("root:".length).trim();
  if (!rootText) {
    return { ok: false, error: `Line ${first.lineNum}: "root:" must have a non-empty label` };
  }

  for (let i = 1; i < meaningful.length; i++) {
    if (meaningful[i].indent === 0 && meaningful[i].text.startsWith("root:")) {
      return { ok: false, error: `Line ${meaningful[i].lineNum}: duplicate "root:" — only one root is allowed` };
    }
  }

  const indentUnit = detectIndentUnit(meaningful);
  const treeLines = [{ ...meaningful[0], text: rootText }, ...meaningful.slice(1)];
  const result = buildIndentTree<MindMapNode>(treeLines, indentUnit, (text) => ({ text, children: [] }));

  if (!result.ok) return result;
  return { ok: true, data: { root: result.root } };
}
