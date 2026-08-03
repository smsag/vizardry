import type { Result } from "./core";

// ── Opportunity Solution Tree ───────────────────────────────────────────────

export interface OSTNode {
  text: string;
  level: number;          // 0 = outcome, 1 = opportunity (need/pain/desire),
                          // 2 = solution, 3 = experiment
  /** The exact keyword this node was authored with (e.g. "need", "pain",
   *  "desire"). Drives the italic caption and locates the line for edits. */
  key: string;
  /** Bare (keyword-less) indented lines nested under this node, rendered as a
   *  chevron bullet list inside the node box. */
  bullets: string[];
  children: OSTNode[];
}

export interface OSTTree {
  root: OSTNode;
  /** Non-fatal parse warnings (e.g. an empty label rendered as a placeholder,
   *  a skipped mis-nested line). Surfaced as a small canvas warning chip. */
  warnings?: string[];
}

export type OSTResult = Result<OSTTree>;
