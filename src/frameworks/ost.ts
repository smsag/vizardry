import type { OSTResult } from "../types";
import { parseKeywordTree } from "../shared/keyword-tree";

/**
 * Opportunity Solution Tree — a keyword-per-level tree rendered as labelled
 * horizontal swim-lanes. Each node names its lane; the strict chain is
 *   outcome → opportunity → solution → experiment
 * with several children allowed at every level. The Opportunity lane accepts
 * three keywords — `need`, `pain`, `desire` — which all sit at level 1 and
 * differ only in the italic caption they show:
 *
 *   outcome: 2x the rental listings on the platform
 *     need: I want tenants who pay on time
 *       solution: A platform to view renter information in one place
 *         Tenant credit checks          ← bare line = bullet on the solution
 *         Background checks
 *         experiment: Usability testing with landlords
 *     pain: I feel anxious about the paperwork
 *     desire: I'd like tenant reviews from previous landlords
 *
 * Bare (keyword-less) indented lines become chevron bullets on the enclosing
 * node. Any node may carry bullets.
 */
const OST_LEVELS = ["outcome", "need", "solution", "experiment"];
const OST_ALIASES = { 1: ["pain", "desire"] };

export function parseOST(source: string): OSTResult {
  const result = parseKeywordTree(source, OST_LEVELS, { aliases: OST_ALIASES, allowBullets: true });
  if (!result.ok) return result;
  return { ok: true, data: { root: result.root } };
}
