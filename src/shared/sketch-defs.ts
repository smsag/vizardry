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
 * The filter region is the default: each shape's own bounding box plus 10%.
 * WebKit (every iOS app, Safari on the Mac) computes turbulence and
 * displacement over the WHOLE region of every filtered shape, painted or not;
 * a fixed 200 000-unit user-space region (0.74.0–0.75.1) cost 16–24 s per
 * canvas in WebKit against 0.2 s in Chromium, and on an iPhone iOS killed the
 * page before it finished — Obsidian froze and reloaded on opening a note.
 * A box-relative region collapses for a perfectly horizontal or vertical
 * stroke (zero-height or zero-width box) and the shape is not drawn, so those
 * shapes carry `data-vzd-flat` (shared/svg.ts) and the sketch CSS leaves them
 * unfiltered: straight rather than invisible.
 */

export const SKETCH_DEFS_ID = "vzd-sketch-defs";
export const SKETCH_FILTER_ID = "vzd-sketch-rough";

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
