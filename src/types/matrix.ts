import type { Result } from "./core";

// ── Matrix (one unified model) ────────────────────────────────────────────────
// A matrix is two tick-labelled axes forming a grid of cells, plus items placed
// on the plane. `x:`/`y:` ticks are equal bands, so N x-ticks × M y-ticks define
// an N×M cell grid. Cells are auto-ided t1…t(N·M) in reading order (t1 = top-left).
// A preset fills default ticks + per-cell heat + colour. Items are cards placed
// by free coordinate ([x,y] in 0…1, origin bottom-left) or snapped to a cell.

export type MatrixPreset = "pain" | "opportunity" | "impact" | "assumption" | "scenario";

/** Cell-tint emphasis level; the hue comes from the chart's single base colour. */
export type Heat = "very-high" | "high" | "medium" | "low";

export interface MatrixAxis {
  title: string;
  ticks: string[]; // band labels, left→right (x) / bottom→top (y)
}

export interface MatrixCell {
  id: string;      // "t1"… reading order, t1 = top-left
  col: number;     // 1…N, left→right
  row: number;     // 1…M, top→bottom
  name?: string;   // author label shown in the cell
  heat?: Heat;
}

export interface MatrixItem {
  label: string;
  content: string; // "\n"-joined detail lines, rendered as a card body
  /** Free coordinate in 0…1 (origin bottom-left). Undefined when snapped to a cell. */
  x?: number;
  y?: number;
  /** Cell id the item is snapped to (e.g. "t1"). Undefined for free coordinates. */
  at?: string;
  /** Explicit `[[#Heading]]` / `[text](#anchor)` annotation on the item line. */
  linkHeading?: string;
  /** Explicit `[text](TICKET)` annotation — the raw target, classified at render. */
  linkTicket?: string;
}

export interface MatrixData {
  preset: MatrixPreset | null;
  xAxis: MatrixAxis;
  yAxis: MatrixAxis;
  cells: MatrixCell[]; // only cells the author named/heated (or the preset heated)
  items: MatrixItem[];
  /** Non-fatal parse warnings (skipped items, dropped cell refs, defaulted
   *  positions). Surfaced as a small canvas warning chip. */
  warnings?: string[];
}

export type MatrixResult = Result<MatrixData>;
