import type { Result } from "./core";

// ── Venn Diagram ─────────────────────────────────────────────────────────────

export interface VennItem {
  text: string;
  linkTarget?: string; // note name from [[Note|Alias]]
}

export interface VennRegion {
  // Sorted circle indices joined by "+": "0", "1", "0+1", "0+1+2", etc.
  key: string;
  items: VennItem[];
}

export interface VennCircle {
  name: string;
}

export interface VennDiagram {
  circles: VennCircle[];
  regions: VennRegion[];
}

export type VennResult = Result<VennDiagram>;
