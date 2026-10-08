/**
 * The shared SVG <filter> that gives sketch-mode canvases their hand-drawn
 * line wobble (feTurbulence → feDisplacementMap). Referenced by id from the
 * sketch CSS (`filter: url(#vzd-sketch-rough)`); harmless when sketch mode is
 * off since nothing references it.
 *
 * One implementation for every host: the plugin injects it into each
 * Obsidian window (main and pop-out), the browser extension into its viewer
 * page. Keeping a single copy means the filter parameters cannot drift
 * between the two.
 *
 * The filter region is in user space, not the default objectBoundingBox
 * (-10%/120% of the referencing shape's bbox). A perfectly horizontal or
 * vertical stroke — an axis, a spine, `M5 12h14` — has a zero-height or
 * zero-width bbox, so a bbox-relative region collapses to nothing and the
 * shape is not drawn at all. Even a thin non-degenerate shape gets its stroke
 * clipped, since the bbox excludes the stroke width. A fixed, generous user-
 * space region can never collapse; the browser only rasterises the part that
 * is actually painted, so its size costs nothing.
 */

export const SKETCH_DEFS_ID = "vzd-sketch-defs";
export const SKETCH_FILTER_ID = "vzd-sketch-rough";

/** Half the side of the user-space filter region; covers any canvas coordinate. */
const REGION_EXTENT = 100000;

/** Injects the filter into `doc` once; a second call is a no-op. */
export function ensureSketchDefs(doc: Document): void {
  if (doc.getElementById(SKETCH_DEFS_ID)) return;
  const NS = "http://www.w3.org/2000/svg";
  const svg = doc.createElementNS(NS, "svg");
  svg.setAttribute("id", SKETCH_DEFS_ID);
  svg.setAttribute("width", "0");
  svg.setAttribute("height", "0");
  svg.setAttribute("aria-hidden", "true");
  svg.style.position = "absolute";
  const filter = doc.createElementNS(NS, "filter");
  filter.setAttribute("id", SKETCH_FILTER_ID);
  filter.setAttribute("filterUnits", "userSpaceOnUse");
  filter.setAttribute("x", String(-REGION_EXTENT));
  filter.setAttribute("y", String(-REGION_EXTENT));
  filter.setAttribute("width", String(2 * REGION_EXTENT));
  filter.setAttribute("height", String(2 * REGION_EXTENT));
  const turb = doc.createElementNS(NS, "feTurbulence");
  turb.setAttribute("type", "fractalNoise");
  turb.setAttribute("baseFrequency", "0.02");
  turb.setAttribute("numOctaves", "2");
  turb.setAttribute("seed", "7");
  turb.setAttribute("result", "noise");
  const disp = doc.createElementNS(NS, "feDisplacementMap");
  disp.setAttribute("in", "SourceGraphic");
  disp.setAttribute("in2", "noise");
  disp.setAttribute("scale", "1.1");
  disp.setAttribute("xChannelSelector", "R");
  disp.setAttribute("yChannelSelector", "G");
  filter.appendChild(turb);
  filter.appendChild(disp);
  svg.appendChild(filter);
  doc.body.appendChild(svg);
}

/** Removes the filter from `doc` if present. */
export function removeSketchDefs(doc: Document): void {
  doc.getElementById(SKETCH_DEFS_ID)?.remove();
}
