/**
 * Colours derived from the user's Obsidian accent, so every canvas shares one
 * palette that re-tints live when the accent changes — never a hardcoded hex.
 *
 * Obsidian exposes the accent decomposed as --accent-h / --accent-s / --accent-l
 * (and the composed --interactive-accent). For a set of sibling items we rotate
 * only the hue for a harmonised spread — index 0 is the accent itself — and keep
 * the accent's saturation and lightness so the colours read as one family.
 *
 * Signal colours (red→green value meters) are the deliberate exception and are
 * set at their call sites, not here.
 */

/** Even hue rotation in degrees for item `index` of `count` (0 = the accent). */
export function accentHueOffset(index: number, count: number): number {
  return Math.round((index * 360) / Math.max(1, count));
}

/** CSS hue token harmonised with the accent: `var(--accent-h)` or `calc(var(--accent-h) + N)`. */
export function accentHueExpr(index: number, count: number): string {
  const offset = accentHueOffset(index, count);
  return offset === 0 ? "var(--accent-h)" : `calc(var(--accent-h) + ${offset})`;
}

/**
 * CSS hue token for item `index` of `count` drawn from a narrow band around
 * the accent (index 0 is the accent, then alternating +/- steps within
 * ±`spread` degrees). For equal alternatives — Odyssey's plans — where an even
 * rotation would land on red and green (it does from Obsidian's default
 * indigo) and read as bad and good next to the plans' red→green score meters.
 */
export function analogousHueExpr(index: number, count: number, spread = 40): string {
  if (index === 0) return "var(--accent-h)";
  const step = spread / Math.max(1, Math.ceil((count - 1) / 2));
  const offset = Math.round(Math.ceil(index / 2) * step * (index % 2 === 1 ? 1 : -1));
  return `calc(var(--accent-h) + ${offset})`;
}

/** A full `hsl(...)` colour harmonised with the accent (rotated hue, accent S/L). */
export function harmonizedAccentColor(index: number, count: number): string {
  return `hsl(${accentHueExpr(index, count)} var(--accent-s) var(--accent-l))`;
}
