import type { Result } from "./core";

// ── Odyssey of Life ───────────────────────────────────────────────────────────
//
// The "Odyssey Plan" from Designing Your Life (Burnett & Evans): a few parallel
// multi-year life plans laid side by side. Each plan has a headline, a vertical
// timeline of year milestones, a dashboard of 0–10 gauges (Resources,
// Likability, Confidence, Coherence by convention), and the open questions it
// raises.

export interface OdysseyMilestone {
  /** Positive year offset (1 = year one). */
  year: number;
  text: string;
}

export interface OdysseyGauge {
  name: string;
  /** Rating clamped to the 0–10 range at parse time. */
  value: number;
}

export interface OdysseyPlan {
  /** Short tag shown in the header chip (e.g. "A"); auto-lettered when omitted. */
  label: string;
  title: string;
  /** Optional one-line descriptor (e.g. "Current path, leveled up"). */
  archetype?: string;
  milestones: OdysseyMilestone[];
  gauges: OdysseyGauge[];
  questions: string[];
}

export interface OdysseyData {
  plans: OdysseyPlan[];
  /** Non-fatal parse issues surfaced as a header chip (graceful degradation). */
  warnings?: string[];
}

export type OdysseyResult = Result<OdysseyData>;
