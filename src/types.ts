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

/**
 * Generic discriminated-union result type used by every parser.
 * `ok: true` carries the parsed data; `ok: false` carries a human-readable
 * error string suitable for display in the canvas error banner.
 */
export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// ParseResult has two sibling payload fields (data + links) on the success
// variant, which doesn't fit the single-data Result<T> pattern, so it is
// kept as a standalone definition.
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

export type ImpactMapResult = Result<ImpactMap>;

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

export type StoryMapResult = Result<StoryMap>;

// ── Mind Map ────────────────────────────────────────────────────────────────

export interface MindMapNode {
  text: string;
  children: MindMapNode[];
}

export interface MindMap {
  root: MindMapNode;
}

export type MindMapResult = Result<MindMap>;

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

export type OSTResult = Result<OSTTree>;

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

export interface SIPOCRow {
  supplier: string;
  input: string;
  process: string;
  output: string;
  customer: string;
}

export interface SIPOCData {
  rows: SIPOCRow[];
}

export type SIPOCResult = Result<SIPOCData>;

// ── Carousel ─────────────────────────────────────────────────────────────────

export interface CarouselImage {
  src: string;
  alt: string;
}

export interface CarouselBlock {
  images: CarouselImage[];
}

export type CarouselResult = Result<CarouselBlock>;

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
  /** Names of components declared with explicit [vis, evo] coordinates.
   *  Anchor-only components (no component: line) are excluded — they have
   *  no source line to write back to, so they cannot be dragged. */
  explicitComponents: Set<string>;
}

export type WardleyResult = Result<WardleyMap>;

// ── SIPOC Flow ────────────────────────────────────────────────────────────────

export type SIPOCNodeShape = "ellipse" | "parallelogram" | "rect";
export type SIPOCColumn = "suppliers" | "inputs" | "process" | "outputs" | "customers";

export interface SIPOCFlowNode {
  id: string;           // normalised label used for link lookup
  label: string;        // display text
  shape: SIPOCNodeShape;
  column: SIPOCColumn;
}

export interface SIPOCFlowLink {
  from: string;         // node id
  to: string;           // node id
}

export interface SIPOCFlowData {
  nodes: SIPOCFlowNode[];
  links: SIPOCFlowLink[];
}

export type SIPOCFlowResult = Result<SIPOCFlowData>;

// ── RACI Matrix ───────────────────────────────────────────────────────────────

export interface RACIRow {
  task: string;
  responsible: string;
  accountable: string;
  consulted: string;
  informed: string;
}

export interface RACIData {
  rows: RACIRow[];
}

export type RACIResult = Result<RACIData>;
