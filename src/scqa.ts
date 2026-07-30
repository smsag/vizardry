import type { SCQAResult, SCQAVariant, SCQAView } from "./types";
import { parseKeywordTree } from "./shared/keyword-tree";

/**
 * Parses the SCQA / SCR narrative source — a keyword-per-level tree in the
 * Impact Map family (same shape as OST).
 *
 * Syntax:
 *   situation: <root>
 *     complication: A new competitor undercuts us
 *       question: How do we defend share?          (scqa only)
 *         answer: Bundle services                  (scqa only — several allowed)
 *
 * For the SCR variant the question level is dropped:
 *   situation: <root>
 *     complication: A config push took payments down
 *       resolution: Add a staged rollout canary    (several allowed)
 *
 * Config lines (optional, anywhere at indent 0):
 *   type: scqa | scr           overrides the variant implied by the fence
 *   view: grid | tree          grid (default) or the branching-tree view
 *
 * The `type:` and `view:` lines are pulled out before the tree parser runs;
 * they are blanked (not removed) so error line numbers still match the source.
 */
const SCQA_LEVELS = ["situation", "complication", "question", "answer"];
const SCR_LEVELS = ["situation", "complication", "resolution"];

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

  const levels = variant === "scqa" ? SCQA_LEVELS : SCR_LEVELS;
  const result = parseKeywordTree(kept.join("\n"), levels);
  if (!result.ok) return result;

  return { ok: true, data: { variant, view, root: result.root } };
}
