import type { Result } from "./core";

// ── Wardley Map ───────────────────────────────────────────────────────────────

export interface WardleyComponent {
  name: string;
  visibility: number; // 0–1, 1 = visible to user (top of Y axis)
  evolution: number;  // 0–1, 1 = commodity (right of X axis)
  /** Future evolution position from an `evolve:` directive (0–1). When set, a
   *  movement arrow is drawn from `evolution` to `evolveTo` (visibility fixed). */
  evolveTo?: number;
}

export interface WardleyLink {
  from: string;
  to: string;
}

/** A sub-component sitting inside a pipeline box, at its own evolution. */
export interface WardleyPipelineItem {
  name: string;
  evolution: number; // 0–1
}

/** A component drawn as a pipeline: a box spanning an evolution range at the
 *  component's visibility, holding sub-components. */
export interface WardleyPipeline {
  component: string; // canonical component name
  x1: number;        // left evolution bound (0–1)
  x2: number;        // right evolution bound (0–1)
  items: WardleyPipelineItem[];
}

export interface WardleyMap {
  anchor: string | null;
  components: WardleyComponent[];
  links: WardleyLink[];
  /** Pipeline boxes: a component drawn as a box spanning an evolution range,
   *  holding sub-components. */
  pipelines: WardleyPipeline[];
  /** Optional custom x-axis evolution stage labels from `stages:` directive. */
  stages?: string[];
  /** Optional normalized x-axis positions (0–1) aligned to `stages`. */
  stagePositions?: number[];
  /** Names of components declared with explicit [vis, evo] coordinates.
   *  Anchor-only components (no component: line) are excluded — they have
   *  no source line to write back to, so they cannot be dragged. */
  explicitComponents: Set<string>;
  /** Non-fatal parse warnings (skipped lines, clamped coords, dropped links).
   *  Surfaced as a small canvas warning chip. */
  warnings?: string[];
}

export type WardleyResult = Result<WardleyMap>;
