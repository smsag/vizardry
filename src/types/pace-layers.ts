import type { Result } from "./core";

// ── Pace Layers ───────────────────────────────────────────────────────────────

export type PaceLayerType = 'shearing' | 'product' | 'retro';

export type PaceLayerName =
  | 'Fashion'
  | 'Commerce'
  | 'Infrastructure'
  | 'Governance'
  | 'Culture'
  | 'Nature';

export interface PaceLayerCell {
  note?: string;
  obs?:  string;
  feed?: string;
  idea?: string;
}

export interface ParsedPaceLayers {
  context: string;
  type: PaceLayerType;
  layers: Partial<Record<PaceLayerName, PaceLayerCell>>;
}

export type PaceLayersResult = Result<ParsedPaceLayers>;
