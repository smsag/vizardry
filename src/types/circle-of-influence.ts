import type { Result } from "./core";

// ── Circle of Influence & Concern ─────────────────────────────────────────────
//
// Covey's Habit 1 (Be Proactive): things you care about sit in the Circle of
// Concern; the subset you can act on is the Circle of Influence. The modern
// three-tier form adds an innermost Circle of Control (your own actions).

/** Outer → inner: what you can do less about → more about. */
export type CircleTier = "concern" | "influence" | "control";

export interface CircleItem {
  tier: CircleTier;
  text: string;
}

export interface CircleOfInfluenceData {
  items: CircleItem[];
  /** Non-fatal parse issues surfaced as a header chip (graceful degradation). */
  warnings?: string[];
}

export type CircleOfInfluenceResult = Result<CircleOfInfluenceData>;
