import type { Result } from "./core";

// ── Concept Map ──────────────────────────────────────────────────────────────

export interface ConceptMapEdge {
  from: string;
  to: string;
  label: string;
}

export interface ConceptMap {
  nodes: string[];
  edges: ConceptMapEdge[];
}

export type ConceptMapResult = Result<ConceptMap>;
