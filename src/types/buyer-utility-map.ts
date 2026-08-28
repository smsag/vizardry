import type { Result } from "./core";

// ── Buyer Utility Map (Blue Ocean) ────────────────────────────────────────────
//
// Kim & Mauborgne's utility map: the six stages of the buyer experience cycle
// (columns) crossed with the six utility levers (rows) — 36 cells. You mark the
// cells where your offering creates a leap in utility (and, as an extension, the
// cells where it imposes a pain). The empty cells are the untapped space.

export type UtilityKind = "utility" | "pain";

export interface UtilityCell {
  /** Column index into `stages`. */
  stageIndex: number;
  /** Row index into `levers`. */
  leverIndex: number;
  kind: UtilityKind;
  note?: string;
}

export interface BuyerUtilityMapData {
  /** Buyer-experience-cycle stages, left → right. */
  stages: string[];
  /** Utility levers, top → bottom. */
  levers: string[];
  cells: UtilityCell[];
  /** Non-fatal parse issues surfaced as a header chip (graceful degradation). */
  warnings?: string[];
}

export type BuyerUtilityMapResult = Result<BuyerUtilityMapData>;
