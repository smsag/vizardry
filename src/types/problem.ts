/**
 * Types for the Problem-statement canvas (`type: problem, <subtype>`) and the
 * shared flow-graph renderer it drives. A problem statement is authored as a
 * flow of labelled cards (one per beat of the narrative arc) connected by
 * `link:` edges, so the data model is a small typed graph: stage-tagged nodes
 * plus directed edges.
 */

/** Emphasis role for a stage, driving the card's visual treatment. */
export type FlowRole = "setup" | "gap" | "stakes" | "direction" | "neutral" | "hi";

/** One beat of the arc: its keyword, the eyebrow shown on the card, and how it
 *  is emphasised. Supplied by the subtype registry, never authored. */
export interface StageDef {
  key: string;      // syntax keyword, lowercase (e.g. "reality")
  eyebrow: string;  // label shown on the card (e.g. "Reality")
  role: FlowRole;
}

/** A card in the flow. `heading` is the bold title (left of `|`, also the link
 *  handle); `body` is the optional supporting sentence (right of `|`). */
export interface FlowNode {
  stage: string;    // the StageDef.key this node belongs to
  id: string;       // normalised handle derived from the heading
  heading: string;
  body?: string;
}

/** A directed edge between two node ids. */
export interface FlowEdge {
  from: string;
  to: string;
}

export interface FlowData {
  subtype: string;      // resolved subtype key (e.g. "engineering")
  stages: StageDef[];   // ordered stages (columns) for this subtype
  nodes: FlowNode[];    // in source order (stacking order within a column)
  edges: FlowEdge[];
  warnings?: string[];
}

export type FlowResult =
  | { ok: true; data: FlowData }
  | { ok: false; error: string };
