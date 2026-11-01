import type { Result } from "./core";

// ── Scribble ──────────────────────────────────────────────────────────────────
//
// A freehand drawing made with a pen (Apple Pencil first), stored inside the
// note itself so every surface that reads the Markdown — the browser
// extension included — can render it. One `stroke:` line per stroke, so adding
// a stroke appends a line and Git / sync merges stay line-shaped.

/** Semantic ink colours; each maps to a theme variable so dark mode works. */
export const INK_COLORS = ["ink", "red", "blue", "green", "orange", "yellow"] as const;
export type InkColor = typeof INK_COLORS[number];

/** Pen strokes are `stroke:` lines; highlighter strokes are `highlight:` lines. */
export type InkKind = "pen" | "highlight";

/** Paper pattern behind the ink; it pans and zooms with the canvas. */
export const SCRIBBLE_BACKGROUNDS = ["blank", "dots", "grid", "lines"] as const;
export type ScribbleBackground = typeof SCRIBBLE_BACKGROUNDS[number];

/**
 * One sampled point in world units on the endless canvas (one unit is one CSS
 * pixel at 100 % zoom), pressure 0–1. Values are already
 * quantised to what the stroke encoding can represent, so encoding a parsed
 * stroke reproduces its source line exactly.
 */
export type InkPoint = readonly [x: number, y: number, pressure: number];

export interface InkStroke {
  readonly kind: InkKind;
  readonly color: InkColor;
  /** Nominal pen width in world units. */
  readonly size: number;
  readonly points: readonly InkPoint[];
}

export interface ScribbleData {
  /** Stable block id (`id:` line); written on the first save when missing. */
  id?: string;
  /** Height of the frame the canvas is shown in, in CSS px. */
  height: number;
  background: ScribbleBackground;
  strokes: InkStroke[];
  /** Non-fatal parse issues surfaced as a header chip (graceful degradation). */
  warnings?: string[];
}

export type ScribbleResult = Result<ScribbleData>;
