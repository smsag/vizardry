/**
 * Stage vocabularies for the Problem-statement canvas, keyed by subtype.
 *
 * Each subtype is one vocabulary of the same narrative arc — Setup → Gap →
 * Stakes → Direction — so a problem statement written in any discipline maps
 * onto the same flow renderer; only the stage keywords and eyebrows differ.
 * The subtype rides the `type:` line as the comma variant
 * (`type: problem, engineering`), so no separate `preset:` key is needed.
 *
 * This mirrors how SIPOC's flow columns (supplier / input / process / output /
 * customer) will feed the same renderer once it adopts this model.
 */

import type { FlowRole, StageDef } from "../types/problem";

const S = (key: string, eyebrow: string, role: FlowRole): StageDef => ({ key, eyebrow, role });

export interface SubtypeDef {
  label: string;
  stages: StageDef[];
}

/** Registry of problem-statement subtypes. `DEFAULT` is used when the `type:`
 *  line carries no variant (`type: problem`). */
export const PROBLEM_SUBTYPES: Record<string, SubtypeDef> = {
  engineering: {
    label: "Engineering",
    stages: [
      S("ideal", "Ideal", "setup"),
      S("reality", "Reality", "gap"),
      S("consequences", "Consequences", "stakes"),
      S("proposal", "Proposal", "direction"),
    ],
  },
  business: {
    label: "Business",
    stages: [
      S("vision", "Vision", "setup"),
      S("issue", "Issue", "gap"),
      S("method", "Proposed method", "direction"),
    ],
  },
  research: {
    label: "Research",
    stages: [
      S("context", "Context", "setup"),
      S("issue", "Issue", "gap"),
      S("relevance", "Relevance", "stakes"),
      S("objective", "Objective", "direction"),
    ],
  },
  fivew: {
    label: "5W·1H",
    stages: [
      S("where", "Where", "setup"),
      S("when", "When", "setup"),
      S("what", "What", "gap"),
      S("who", "Who", "stakes"),
      S("why", "Why", "stakes"),
      S("how", "How", "direction"),
    ],
  },
};

export const DEFAULT_PROBLEM_SUBTYPE = "engineering";

/** Resolves a `type:` variant to a subtype, defaulting when absent. Returns
 *  null for an unrecognised subtype so the parser can list the valid ones. */
export function resolveProblemSubtype(
  variant?: string,
): { key: string; def: SubtypeDef } | null {
  const key = variant?.trim().toLowerCase() || DEFAULT_PROBLEM_SUBTYPE;
  const def = PROBLEM_SUBTYPES[key];
  return def ? { key, def } : null;
}

/** Comma-separated list of valid subtypes, for error messages. */
export function problemSubtypeList(): string {
  return Object.keys(PROBLEM_SUBTYPES).join(", ");
}
