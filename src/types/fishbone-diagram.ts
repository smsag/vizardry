import type { Result } from "./core";

// ── Fishbone (Ishikawa) Diagram ──────────────────────────────────────────────

export interface FishboneSubcause {
  name: string;
}

export interface FishboneCause {
  name: string;
  subcauses: FishboneSubcause[];
}

export interface FishboneCategory {
  name: string;
  causes: FishboneCause[];
}

export interface FishboneDiagram {
  effect: string;
  categories: FishboneCategory[];
}

export type FishboneResult = Result<FishboneDiagram>;
