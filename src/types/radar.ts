import type { Result } from "./core";

// ── Radar / Spider chart ──────────────────────────────────────────────────────
//
// A multi-attribute self-assessment (e.g. Petra Wille's Agility Attributes
// Assessment): each axis is a statement scored 0–10, plotted on its own spoke
// and connected into a filled polygon.

export interface RadarAxis {
  label: string;
  /** Score clamped to the 0–10 range at parse time. */
  score: number;
}

export interface RadarData {
  axes: RadarAxis[];
  /** Non-fatal parse issues surfaced as a header chip (graceful degradation). */
  warnings?: string[];
}

export type RadarResult = Result<RadarData>;
