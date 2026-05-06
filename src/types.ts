export interface FrameworkDefinition {
  id: string;
  label: string;
  blocks: BlockDefinition[];
  gridTemplate: string;
  gridColumns: string;
  gridRows: string;
}

export interface BlockDefinition {
  label: string;
  area: string;
}

export type ParseResult =
  | { ok: true; data: Record<string, string>; links: Record<string, string> }
  | { ok: false; error: string };

// ── Impact Map ──────────────────────────────────────────────────────────────

export interface ImpactItem {
  name: string;
  deliverables: string[];
}

export interface ImpactActor {
  name: string;
  impacts: ImpactItem[];
}

export interface ImpactMap {
  goal: string;
  actors: ImpactActor[];
}

export type ImpactMapResult =
  | { ok: true; data: ImpactMap }
  | { ok: false; error: string };

// ── Story Map ───────────────────────────────────────────────────────────────

export interface StoryTask {
  name: string;
  subtitle: string;
}

export interface StoryStep {
  name: string;
  tasks: StoryTask[];
}

export interface StoryActivity {
  name: string;
  steps: StoryStep[];
}

export interface StorySlice {
  name: string;
  // step name (lowercased) → task names (lowercased) assigned to this slice
  cells: Record<string, string[]>;
}

export interface StoryMap {
  user: string;
  goal: string;
  activities: StoryActivity[];
  slices: StorySlice[];
}

export type StoryMapResult =
  | { ok: true; data: StoryMap }
  | { ok: false; error: string };

// ── Mind Map ────────────────────────────────────────────────────────────────

export interface MindMapNode {
  text: string;
  children: MindMapNode[];
}

export interface MindMap {
  root: MindMapNode;
}

export type MindMapResult =
  | { ok: true; data: MindMap }
  | { ok: false; error: string };

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

export type VennResult =
  | { ok: true; data: VennDiagram }
  | { ok: false; error: string };
