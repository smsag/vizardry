import type { Result } from "./core";

// ── Strategy Canvas (Blue Ocean) ──────────────────────────────────────────────
//
// Kim & Mauborgne's central diagnostic: the competing factors of an industry on
// the X axis, the offering level (Low → High, 0–10) on the Y axis, and one
// "value curve" per player (you, a rival, the industry average) drawn across
// them. Divergence between the curves is the strategy.

export interface StrategyFactor {
  label: string;
  /** One score per series, in series order. `null` marks a gap (no score given
   *  for that series on this factor) — the curve simply skips it. */
  scores: (number | null)[];
}

export interface StrategyCanvasData {
  /** Value-curve labels, in draw order (index 0 = the accent colour). */
  series: string[];
  factors: StrategyFactor[];
  /** Non-fatal parse issues surfaced as a header chip (graceful degradation). */
  warnings?: string[];
}

export type StrategyCanvasResult = Result<StrategyCanvasData>;
