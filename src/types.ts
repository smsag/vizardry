export interface FrameworkDefinition {
  id: string;
  label: string;
  description: string;
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

// ── Opportunity Solution Tree ───────────────────────────────────────────────

export interface OSTNode {
  text: string;
  level: number;          // 0 = outcome, 1 = opportunity, 2 = solution,
                          // 3 = experiment, 4 = assumption
  children: OSTNode[];
}

export interface OSTTree {
  root: OSTNode;
}

export type OSTResult =
  | { ok: true; data: OSTTree }
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

// ── Shared Tree Node (used by OST, Mind Map, Impact Map renderers) ──────────

export interface TreeNode {
  text: string;
  level: number;
  sublabel?: string;
  children: TreeNode[];

  // Set by layout engine — do not populate outside renderer
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TreeNodeStyle {
  fillVar: string;
  textVar: string;
  borderRadius: number;
  dashed: boolean;
  accentBar?: boolean;
}

export interface TreeRenderOptions {
  nodeW: number;
  nodeH: number;
  levelGap: number;
  siblingGap: number;
  hPadding: number;
  vPadding: number;
  maxLabelChars: number;
  levelStyles: TreeNodeStyle[];
  canvasClass: string;
  wrapperClass: string;
}

// ── SIPOC ────────────────────────────────────────────────────────────────────

export interface SIPOCData {
  suppliers: string[];
  inputs: string[];
  process: string[];
  outputs: string[];
  customers: string[];
}

export type SIPOCResult =
  | { ok: true; data: SIPOCData }
  | { ok: false; error: string };

// ── Carousel ─────────────────────────────────────────────────────────────────

export interface CarouselImage {
  src: string;
  alt: string;
}

export interface CarouselBlock {
  images: CarouselImage[];
}

export type CarouselResult =
  | { ok: true; data: CarouselBlock }
  | { ok: false; error: string };

// ── Wardley Map ───────────────────────────────────────────────────────────────

export interface WardleyComponent {
  name: string;
  visibility: number; // 0–1, 1 = visible to user (top of Y axis)
  evolution: number;  // 0–1, 1 = commodity (right of X axis)
}

export interface WardleyLink {
  from: string;
  to: string;
}

export interface WardleyMap {
  anchor: string | null;
  components: WardleyComponent[];
  links: WardleyLink[];
}

export type WardleyResult =
  | { ok: true; data: WardleyMap }
  | { ok: false; error: string };
