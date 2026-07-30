import type { OSTResult } from "../types";
import { parseKeywordTree } from "../shared/keyword-tree";

/**
 * Opportunity Solution Tree — a keyword-per-level tree in the Impact Map
 * family. Each node names its level; the strict chain is
 *   outcome → opportunity → solution → experiment → assumption
 * with several children allowed at every level:
 *
 *   outcome: Increase activation
 *     opportunity: Users don't grasp the value
 *       solution: Add an interactive tour
 *         experiment: A/B test tour vs. video
 *           assumption: Users prefer guided tours
 *       solution: Simplify the empty state
 *     opportunity: Setup feels heavy
 *
 * Legacy bare-indent blocks (root keyword only) still parse — see
 * parseKeywordTree.
 */
const OST_LEVELS = ["outcome", "opportunity", "solution", "experiment", "assumption"];

export function parseOST(source: string): OSTResult {
  const result = parseKeywordTree(source, OST_LEVELS);
  if (!result.ok) return result;
  return { ok: true, data: { root: result.root } };
}
