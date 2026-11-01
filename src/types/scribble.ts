import type { Result } from "./core";

// ── Scribble ──────────────────────────────────────────────────────────────────
//
// A freehand drawing made with a pen (Apple Pencil first), stored inside the
// note itself so every surface that reads the Markdown — the browser
// extension included — can render it. One `stroke:` line per stroke, so adding
// a stroke appends a line and Git / sync merges stay line-shaped.

/** Semantic ink colours; each maps to a theme variable so dark mode works. */
export const INK_COLORS = ["ink", "red", "blue", "green", "orange"] as const;
export type InkColor = typeof INK_COLORS[number];

/**
 * One sampled point in logical canvas units: x across a fixed 1000-unit
 * width, y down the block's `height:`, pressure 0–1. Values are already
 * quantised to what the stroke encoding can represent, so encoding a parsed
 * stroke reproduces its source line exactly.
 */
export type InkPoint = readonly [x: number, y: number, pressure: number];

export interface InkStroke {
  readonly color: InkColor;
  /** Nominal pen width in logical units. */
  readonly size: number;
  readonly points: readonly InkPoint[];
}

export interface ScribbleData {
  /** Stable block id (`id:` line); written on the first save when missing. */
  id?: string;
  /** Logical canvas height; the width is always SCRIBBLE_WIDTH. */
  height: number;
  strokes: InkStroke[];
  /** Non-fatal parse issues surfaced as a header chip (graceful degradation). */
  warnings?: string[];
}

export type ScribbleResult = Result<ScribbleData>;
