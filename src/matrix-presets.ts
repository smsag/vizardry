import { t } from "./i18n";
import type { TranslationKey } from "./i18n/locales/en";
import type { Heat, MatrixCell, MatrixPreset } from "./types";

/**
 * A preset is sugar: default axis titles + ticks, a base colour, and a heat
 * FUNCTION applied to whatever grid the ticks end up defining (so heat still
 * works if the author overrides the tick count). `heat(col, row, cols, rows)`
 * takes 1-indexed positions with row 1 = top.
 */
export interface PresetDef {
  color: string;
  xTitle: () => string;
  yTitle: () => string;
  xTicks: () => string[]; // left → right
  yTicks: () => string[]; // bottom → top
  heat: (col: number, row: number, cols: number, rows: number) => Heat | null;
}

/** Fallback base colour for a preset-less matrix. */
export const BLANK_COLOR = "var(--interactive-accent)";

// Both axes point the same way (index 1 = the "good" end), so priority is an
// even diagonal — hottest at the top-left, cooling to the bottom-right.
function additiveHeat(col: number, row: number, cols: number, rows: number): Heat {
  const max = (cols - 1) + (rows - 1);
  const ratio = max === 0 ? 0 : ((col - 1) + (row - 1)) / max;
  if (ratio <= 0.17) return "very-high";
  if (ratio <= 0.5) return "high";
  if (ratio <= 0.83) return "medium";
  return "low";
}

// Importance × evidence is a gate, not a sum: an assumption matters only when it
// is both important AND unproven. Heat = importance × ignorance, concentrating
// it in the top-left and cooling both off-diagonal corners.
function gatedHeat(col: number, row: number, cols: number, rows: number): Heat {
  const importance = rows + 1 - row; // top row (row 1) → most important
  const ignorance = cols + 1 - col;  // left col (col 1) → least evidence
  const ratio = (importance * ignorance) / (cols * rows);
  if (ratio >= 0.75) return "very-high";
  if (ratio >= 0.5) return "high";
  if (ratio >= 0.3125) return "medium";
  return "low";
}

const rowLabels = (type: string): string[] =>
  [1, 2, 3, 4].map(i => t(`matrix.row.${type}.${i}` as TranslationKey)); // top → bottom
const colLabels = (type: string): string[] =>
  [1, 2, 3, 4].map(i => t(`matrix.col.${type}.${i}` as TranslationKey)); // left → right
const yTicks = (type: string): string[] => rowLabels(type).slice().reverse(); // bottom → top

function priorityPreset(type: string, color: string, heat: PresetDef["heat"]): PresetDef {
  return {
    color,
    xTitle: () => t(`matrix.axis.${type}.x` as TranslationKey),
    yTitle: () => t(`matrix.axis.${type}.y` as TranslationKey),
    xTicks: () => colLabels(type),
    yTicks: () => yTicks(type),
    heat,
  };
}

export const PRESETS: Record<MatrixPreset, PresetDef> = {
  pain:        priorityPreset("pain", "hsl(0, 70%, 55%)", additiveHeat),
  opportunity: priorityPreset("opportunity", "hsl(220, 65%, 55%)", additiveHeat),
  impact:      priorityPreset("impact", "hsl(145, 55%, 42%)", additiveHeat),
  assumption:  priorityPreset("assumption", "hsl(265, 55%, 58%)", gatedHeat),
  scenario: {
    color: "hsl(215, 45%, 55%)",
    xTitle: () => t("matrix.axis.scenario.x"),
    yTitle: () => t("matrix.axis.scenario.y"),
    xTicks: () => [t("matrix.scenario.low"), t("matrix.scenario.high")],
    yTicks: () => [t("matrix.scenario.low"), t("matrix.scenario.high")],
    heat: () => null,
  },
};

export function presetColor(preset: MatrixPreset | null): string {
  return preset ? PRESETS[preset].color : BLANK_COLOR;
}

/** Cell id ↔ (col, row) mapping. t1 = top-left, reading order (→ then ↓). */
export function cellId(col: number, row: number, cols: number): string {
  return `t${(row - 1) * cols + col}`;
}

/**
 * Builds the full N×M cell grid, applying the preset's heat function and then
 * the author's per-cell name/heat overrides (keyed by cell id).
 */
export function resolveCells(
  preset: MatrixPreset | null,
  cols: number,
  rows: number,
  overrides: Map<string, { name?: string; heat?: Heat }>,
): MatrixCell[] {
  const heatFn = preset ? PRESETS[preset].heat : () => null;
  const cells: MatrixCell[] = [];
  for (let row = 1; row <= rows; row++) {
    for (let col = 1; col <= cols; col++) {
      const id = cellId(col, row, cols);
      const override = overrides.get(id);
      const heat = override?.heat ?? heatFn(col, row, cols, rows) ?? undefined;
      const cell: MatrixCell = { id, col, row };
      if (heat) cell.heat = heat;
      if (override?.name) cell.name = override.name;
      cells.push(cell);
    }
  }
  return cells;
}
