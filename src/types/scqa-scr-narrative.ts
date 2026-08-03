import type { Result } from "./core";

// ── SCQA / SCR Narrative ────────────────────────────────────────────────────
// An indent-based hierarchy (same parser family as OST). One `situation:` root
// branches into complications, each into questions, each holding a single
// answer. The SCR variant drops the question level (resolution sits directly
// under a complication). The whole hierarchy renders either as a top-down grid
// of cards (default) or, via `view: tree`, as an OST-style branching diagram.

export type SCQAVariant = "scqa" | "scr";
export type SCQAView = "grid" | "tree";

export interface SCQANode {
  text: string;
  level: number;          // scqa: 0 situation, 1 complication, 2 question, 3 answer
                          // scr:  0 situation, 1 complication, 2 resolution
  /** Source keyword (situation/complication/…) — set by the parser. */
  key?: string;
  /** Bare indented lines under this node, rendered as chevron bullets. */
  bullets?: string[];
  children: SCQANode[];
}

export interface SCQAData {
  variant: SCQAVariant;
  view: SCQAView;
  root: SCQANode;
  /** Non-fatal parse warnings (see OSTTree.warnings). */
  warnings?: string[];
}

export type SCQAResult = Result<SCQAData>;
