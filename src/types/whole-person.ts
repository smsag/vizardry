import type { Result } from "./core";

// ── Whole Person / Four Dimensions ────────────────────────────────────────────
//
// Covey's Whole-Person Paradigm (8th Habit) and "Sharpen the Saw" (Habit 7):
// a balanced life renews four dimensions — Body (physical), Mind (mental),
// Heart (social/emotional), and Spirit (spiritual). Each is scored 0–10 and
// carries optional renewal activities.

export type WholePersonDimension = "body" | "mind" | "heart" | "spirit";

export interface WholePersonEntry {
  dimension: WholePersonDimension;
  /** Score clamped to the 0–10 range at parse time. */
  score: number;
  activities: string[];
}

export interface WholePersonData {
  /** Always the four dimensions in canonical order (body, mind, heart, spirit). */
  entries: WholePersonEntry[];
  /** Non-fatal parse issues surfaced as a header chip (graceful degradation). */
  warnings?: string[];
}

export type WholePersonResult = Result<WholePersonData>;
