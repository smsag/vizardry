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

export interface StoryMapSlice {
  name: string;
  cells: Record<string, string>; // backbone item (lowercased) → content
}

export interface StoryMap {
  backbone: string[];
  slices: StoryMapSlice[];
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
