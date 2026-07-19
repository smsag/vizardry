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
  /** Faint italic prompt shown when the block is empty. */
  placeholder?: string;
  /** Render block content as draggable cards (one card per non-empty line). */
  cardBlock?: boolean;
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
  | { ok: true; data: Record<string, string>; links: Record<string, string>; cardBlocks: Set<string>; allCards: boolean }
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

// ── SCQA / SCR Narrative ────────────────────────────────────────────────────
// An indent-based hierarchy (same parser family as OST). One `situation:` root
// branches into complications, each into questions, each holding a single
// answer. The SCR variant drops the question level (resolution sits directly
// under a complication). The whole hierarchy renders either as a top-down grid
// of cards (default) or, via `view: tree`, as an OST-style branching diagram.

export type SCQAVariant = "scqa" | "scr";
export type SCQAView = "grid" | "tree";

export interface SCQANode {
  text: string;
  level: number;          // scqa: 0 situation, 1 complication, 2 question, 3 answer
                          // scr:  0 situation, 1 complication, 2 resolution
  children: SCQANode[];
}

export interface SCQAData {
  variant: SCQAVariant;
  view: SCQAView;
  root: SCQANode;
}

export type SCQAResult = Result<SCQAData>;

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
  /** Layout direction. "down" (default) = root at top. "right" = root at left.
   *  "left" = root at right (RTL). */
  direction?: "down" | "right" | "left";
  /** Deepest level that may have children added. Nodes at this level or deeper
   *  do not render the "+" add-child button. Omit to allow add at all levels. */
  maxAddLevel?: number;
}

/** Callbacks supplied by the caller when tree nodes should be editable. */
export interface TreeEditHandlers {
  onRename: (node: TreeNode, newText: string) => void;
  onAddChild: (node: TreeNode) => void;
  onDelete: (node: TreeNode) => void;
}

// ── SIPOC ────────────────────────────────────────────────────────────────────
//
// One canvas, two views over the same data: "table" (default) renders `rows`
// as an editable table; "flow" derives a node/link diagram from those same
// rows (see renderer/sipoc.ts) so nothing needs to be re-entered when
// switching. `links` is parsed unconditionally regardless of the active view
// — it sits inert in table view and resurfaces the moment you switch to flow,
// exactly as Owner/Metric sit inert in flow view and resurface in table view.

export type SIPOCVariant = "table" | "flow";

export interface SIPOCRow {
  supplier: string;
  input: string;
  process: string;
  output: string;
  customer: string;
  owner: string;
  metric: string;
}

/** A `link: A -> B` directive — raw, un-normalised text pairs. Only ever
 *  resolved against actual nodes when rendering flow view (see
 *  renderer/sipoc.ts's deriveFlowGraph) — never validated at parse time, so
 *  a stale link can't break table view. */
export interface SIPOCFlowLink {
  from: string;
  to: string;
}

export interface SIPOCData {
  variant: SIPOCVariant;
  rows: SIPOCRow[];
  links: SIPOCFlowLink[];
}

export type SIPOCResult = Result<SIPOCData>;

export type SIPOCColumn = "suppliers" | "inputs" | "process" | "outputs" | "customers";

/** Renderer-internal node for flow view's derived diagram — never produced
 *  by the parser; built from `rows` at render time (see renderer/sipoc.ts).
 *  Always drawn as a plain rect — there's no source syntax for a per-node
 *  shape override since the old freeform `Name [shape]` declarations were
 *  dropped in favour of deriving nodes from table rows. */
export interface SIPOCFlowNode {
  id: string;           // normalised label used for link lookup
  label: string;        // display text
  column: SIPOCColumn;
}

// ── Customer Journey Map / Service Blueprint ────────────────────────────────
// One canvas, two variants over the same phase/lane data (see the doc comment
// on SIPOCData above for the precedent this follows). frontstage:/backstage:/
// support: lines are parsed unconditionally regardless of variant — they sit
// inert in journey view and resurface the moment the block's `type:` line is
// hand-edited from "journey" to "journey, blueprint" (there is no in-canvas
// button for this — switching variant is a source edit only, exactly like
// SIPOC's `type: sipoc` / `type: sipoc, flow`), and owner/metric sit inert in
// table view and resurface in flow view.

export type JourneyVariant = "journey" | "blueprint";

export type JourneyLaneKey =
  | "action" | "touchpoint" | "feeling" | "painpoint" | "opportunity"
  | "frontstage" | "backstage" | "support";

export interface JourneyCard {
  name: string;
  subtitle: string;
}

export interface JourneyPhase {
  name: string;
  lanes: Partial<Record<JourneyLaneKey, JourneyCard[]>>;
}

export interface JourneyData {
  variant: JourneyVariant;
  persona: string;
  scenario: string;
  phases: JourneyPhase[];
}

export type JourneyResult = Result<JourneyData>;

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
  /** Optional custom x-axis evolution stage labels from `stages:` directive. */
  stages?: string[];
  /** Optional normalized x-axis positions (0–1) aligned to `stages`. */
  stagePositions?: number[];
  /** Names of components declared with explicit [vis, evo] coordinates.
   *  Anchor-only components (no component: line) are excluded — they have
   *  no source line to write back to, so they cannot be dragged. */
  explicitComponents: Set<string>;
}

export type WardleyResult = Result<WardleyMap>;

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

// ── Pace Layers ───────────────────────────────────────────────────────────────

export type PaceLayerType = 'shearing' | 'product' | 'retro';

export type PaceLayerName =
  | 'Fashion'
  | 'Commerce'
  | 'Infrastructure'
  | 'Governance'
  | 'Culture'
  | 'Nature';

export interface PaceLayerCell {
  note?: string;
  obs?:  string;
  feed?: string;
  idea?: string;
}

export interface ParsedPaceLayers {
  context: string;
  type: PaceLayerType;
  layers: Partial<Record<PaceLayerName, PaceLayerCell>>;
}

export type PaceLayersResult = Result<ParsedPaceLayers>;

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

// ── Node Map ──────────────────────────────────────────────────────────────────

/** A palette name, or a raw "#rgb"/"#rrggbb" hex literal passed through as-authored. */
export type NodeMapColor =
  | "red" | "orange" | "yellow" | "green" | "teal"
  | "blue" | "purple" | "pink" | "gray"
  | `#${string}`;

export type NodeMapLinkDirection = "directed" | "bidirectional" | "undirected";
export type NodeMapLineStyle = "solid" | "dashed";

export interface NodeMapBox {
  name: string;
  x: number;
  y: number;
  color?: NodeMapColor;
  /** Multi-line body text, "\n"-joined from indented continuation lines. */
  body?: string;
}

export interface NodeMapLink {
  from: string;
  to: string;
  direction: NodeMapLinkDirection;
  label?: string;
  color?: NodeMapColor;
  style: NodeMapLineStyle;
}

export interface NodeMapData {
  boxes: NodeMapBox[];
  links: NodeMapLink[];
}

export type NodeMapResult = Result<NodeMapData>;

// ── Pain / Opportunity Matrix ─────────────────────────────────────────────────

export type MatrixType = "pain" | "opportunity" | "impact";

export interface MatrixData {
  type: MatrixType;
  data: Record<string, string>;
  cardBlocks: Set<string>;
  allCards: boolean;
}

export type MatrixResult = Result<MatrixData>;
