import type { Result } from "./core";

// ── Wheel of Life ─────────────────────────────────────────────────────────────

/**
 * One life area (a wedge on the wheel): a name, a 0–10 score fill level, and an
 * optional short note shown in the area's tooltip.
 */
export interface WheelOfLifeArea {
  name: string;
  /** Satisfaction score, clamped to the 0–10 range at parse time. */
  score: number;
  note?: string;
}

export interface WheelOfLifeData {
  areas: WheelOfLifeArea[];
  /** Non-fatal parse issues surfaced as a header chip (graceful degradation). */
  warnings?: string[];
}

export type WheelOfLifeResult = Result<WheelOfLifeData>;
