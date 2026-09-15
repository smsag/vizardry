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
