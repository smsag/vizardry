import type { Result } from "./core";

// ── Now/Next/Later Roadmap ────────────────────────────────────────────────────

export interface RoadmapItem {
  title: string;
  subtitle: string;
}

export interface RoadmapColumn {
  id: "now" | "next" | "later";
  items: RoadmapItem[];
}

export interface RoadmapData {
  columns: RoadmapColumn[];
}

export type RoadmapResult = Result<RoadmapData>;
