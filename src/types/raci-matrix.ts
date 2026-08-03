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
}

export type RACIResult = Result<RACIData>;
