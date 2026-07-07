import type { SCQANode, SCQAResult, SCQAVariant, SCQAView } from "./types";
import { buildIndentTree, detectIndentUnit, extractMeaningfulLines } from "./shared/indent-tree";

/**
 * Parses the SCQA / SCR narrative source — an indent-based hierarchy in the
 * same family as OST and the Mind Map.
 *
 * Syntax:
 *   situation: <root>          (level 0, single, required)
 *     Complication one         (level 1)
 *       Question one           (level 2, scqa only)
 *         Answer one           (level 3, scqa only — a question may have several)
 *
 * For the SCR variant the third keyword level is dropped:
 *   situation: <root>
 *     Complication one
 *       Resolution             (level 2)
 *
 * Config lines (optional, anywhere at indent 0):
 *   type: scqa | scr           overrides the variant implied by the fence
 *   view: grid | tree          grid (default) or the branching-tree view
 *
 * The `type:` and `view:` lines are pulled out before the indent parser runs;
 * they are blanked (not removed) so error line numbers still match the source.
 */
export function parseSCQA(source: string, fenceVariant: SCQAVariant): SCQAResult {
  let variant = fenceVariant;
  let view: SCQAView = "grid";

  const kept: string[] = [];
  for (const raw of source.split("\n")) {
    const trimmed = raw.trim();
    const lower = trimmed.toLowerCase();

    if (lower.startsWith("type:")) {
      const v = trimmed.slice("type:".length).trim().toLowerCase();
      if (v === "scr" || v === "scqa") variant = v;
      else return { ok: false, error: `Unknown type "${v}" — use "scqa" or "scr"` };
      kept.push("");
      continue;
    }
    if (lower.startsWith("view:")) {
      const v = trimmed.slice("view:".length).trim().toLowerCase();
      if (v === "grid" || v === "tree") view = v;
      else return { ok: false, error: `Unknown view "${v}" — use "grid" or "tree"` };
      kept.push("");
      continue;
    }
    kept.push(raw);
  }

  const meaningful = extractMeaningfulLines(kept.join("\n"));
  if (meaningful.length === 0) {
    return { ok: false, error: 'Missing required "situation:" field' };
  }

  const first = meaningful[0];
  if (!first.text.toLowerCase().startsWith("situation:")) {
    return { ok: false, error: `Line ${first.lineNum}: first line must be "situation: <text>"` };
  }
  if (first.indent !== 0) {
    return { ok: false, error: `Line ${first.lineNum}: "situation:" must be at indent level 0` };
  }

  const rootText = first.text.slice("situation:".length).trim();
  if (!rootText) {
    return { ok: false, error: `Line ${first.lineNum}: "situation:" must have a non-empty label` };
  }

  for (let i = 1; i < meaningful.length; i++) {
    if (meaningful[i].indent === 0 && meaningful[i].text.toLowerCase().startsWith("situation:")) {
      return { ok: false, error: `Line ${meaningful[i].lineNum}: duplicate "situation:" — only one situation is allowed` };
    }
  }

  // scqa: levels 0–3 (situation→complication→question→answer)
  // scr:  levels 0–2 (situation→complication→resolution)
  const maxDepth = variant === "scqa" ? 3 : 2;
  const indentUnit = detectIndentUnit(meaningful);
  const treeLines = [{ ...first, text: rootText }, ...meaningful.slice(1)];

  const makeNode = (text: string, level: number): SCQANode => ({ text, level, children: [] });
  const result = buildIndentTree<SCQANode>(treeLines, indentUnit, makeNode, maxDepth);
  if (!result.ok) return result;

  return { ok: true, data: { variant, view, root: result.root } };
}
