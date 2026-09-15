/**
 * Vizardry's own mark, used by the sideleaf tab.
 *
 * The leaf used to borrow Lucide's `layout-template`, which is also the
 * ribbon's icon — so the panel and the "insert a canvas" button were
 * indistinguishable in the sidebar. The ribbon keeps that icon, because it
 * still means "insert a canvas"; the leaf gets this, which means Vizardry.
 *
 * A V with a spark off its right arm: the monogram, and the "wizardry" in the
 * name. Drawn on Lucide's 24-unit grid at stroke 2 with round caps, so it sits
 * correctly among Obsidian's built-in icons, then scaled into the 100-unit box
 * `addIcon` expects. Stroke width scales with the group, so the proportions
 * survive the transform.
 *
 * The spark is a filled star rather than a stroked outline. A sidebar tab
 * renders at about 18px, and at that size a stroked star collapses into a
 * blob — the fill stays legible.
 */

export const VIZARDRY_ICON_ID = "vizardry-v";

/** 100 / 24 — Lucide's grid into the box `addIcon` draws in. */
const SCALE = 100 / 24;

export const VIZARDRY_ICON_SVG = `<g transform="scale(${SCALE.toFixed(4)})" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5 L10.5 19 L17 5.5"/><path d="M18.5 1.9 L19.58 4.42 L22.1 5.5 L19.58 6.58 L18.5 9.1 L17.42 6.58 L14.9 5.5 L17.42 4.42 Z" fill="currentColor" stroke="none"/></g>`;
