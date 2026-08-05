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

/** A full `hsl(...)` colour harmonised with the accent (rotated hue, accent S/L). */
export function harmonizedAccentColor(index: number, count: number): string {
  return `hsl(${accentHueExpr(index, count)} var(--accent-s) var(--accent-l))`;
}
