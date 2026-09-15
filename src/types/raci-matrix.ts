import type { Result } from "./core";

// ── RACI Matrix ───────────────────────────────────────────────────────────────

export interface RACIRow {
  task: string;
  responsible: string;
  accountable: string;
  consulted: string;
  informed: string;
}

export interface RACIData {
  rows: RACIRow[];
  /** Recoverable problems (several accountable names on one task) shown under the canvas. */
  warnings?: string[];
}

export type RACIResult = Result<RACIData>;
