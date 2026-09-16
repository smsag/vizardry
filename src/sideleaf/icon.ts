/**
 * Vizardry's own mark: a canvas grid with a spark in one cell.
 *
 * One icon for the ribbon entry, the entry commands and the sideleaf tab, so
 * the thing a person clicks and the thing that opens look like each other. The
 * ribbon used to borrow Lucide's `layout-template` and the leaf carried a
 * V monogram; a plugin's entry points should share one mark, and a grid with a
 * spark says both "canvas" and "wizardry" where the V said only the name.
 *
 * Drawn on Lucide's 24-unit grid with round caps, so it sits
 * correctly among Obsidian's built-in icons, then scaled into the 100-unit box
 * `addIcon` expects. Stroke width scales with the group, so the proportions
 * survive the transform; the stroke width is Obsidian's, inherited (see below). Stroke only, `currentColor` throughout: the icon
 * follows the theme and the accent, never a colour of its own.
 */

export const VIZARDRY_ICON_ID = "vizardry-logo";

/** 100 / 24 — Lucide's grid into the box `addIcon` draws in. */
const SCALE = 100 / 24;

/** The artwork as designed; the geometry is final and is not edited here. */
const ARTWORK = [
  '<rect x="3" y="4" width="18" height="16" rx="2"/>',
  '<path d="M9 4v10"/>',
  '<path d="M15 4v16"/>',
  '<path d="M3 14h12"/>',
  '<path d="M18 6.5v5"/>',
  '<path d="M15.5 9h5"/>',
].join("");

/**
 * No `stroke-width` here, deliberately. Obsidian's `.svg-icon` sets
 * `stroke-width: var(--icon-stroke)` — 1.75px in a sidebar tab, other values in
 * the ribbon and menus — and a Lucide icon has no attribute of its own, so it
 * inherits that. An attribute on this group would block it, and the group's
 * `scale()` multiplies the stroke along with the geometry: a hardcoded 2 drew
 * at 8.33% of the icon's width where every neighbour sat at 7.29%, which reads
 * as a darker glyph in the row. `assets/logo.svg` keeps its own `stroke-width`:
 * a standalone file has no stylesheet to inherit from.
 */
export const VIZARDRY_ICON_SVG = `<g transform="scale(${SCALE.toFixed(4)})" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">${ARTWORK}</g>`;
