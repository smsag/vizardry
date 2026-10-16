export function createSvgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {}
): SVGElementTagNameMap[K] {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  markFlatShape(node);
  return node;
}

/**
 * The attribute the sketch CSS reads to leave a shape unfiltered. The wobble
 * filter's region is the shape's own bounding box (see sketch-defs.ts), and a
 * perfectly horizontal or vertical stroke has a zero-height or zero-width box:
 * filtered, it would not be drawn at all. Unfiltered, it is simply straight.
 */
export const FLAT_SHAPE_ATTR = "data-vzd-flat";

/**
 * Mark or unmark `el` as flat from its own geometry. Called for every shape by
 * `createSvgEl`; call it again after changing a shape's geometry afterwards
 * (a dragged or rubber-band line), or the mark describes the old geometry.
 */
export function markFlatShape(el: Element): void {
  if (isFlatShape(el)) el.setAttribute(FLAT_SHAPE_ATTR, "");
  else el.removeAttribute(FLAT_SHAPE_ATTR);
}

const num = (el: Element, name: string): number => {
  const v = parseFloat(el.getAttribute(name) ?? "");
  return Number.isFinite(v) ? v : 0;
};

/** All x equal or all y equal: a box with no width or no height. */
function collinearOnAxis(xs: number[], ys: number[]): boolean {
  if (xs.length === 0) return true;
  return xs.every((x) => x === xs[0]) || ys.every((y) => y === ys[0]);
}

/**
 * True when the shape's bounding box has no width or no height, read from its
 * attributes — no layout, so it works on a shape not yet in the document.
 *
 * A wrongly flat shape merely loses its wobble; a wrongly non-flat one is not
 * drawn in sketch mode. So a curve counts by its control points, which bound
 * it, and a shape kind this does not know (circle, ellipse) is never flat — it
 * keeps the filter, as before.
 */
export function isFlatShape(el: Element): boolean {
  switch (el.tagName.toLowerCase()) {
    case "line":
      return num(el, "x1") === num(el, "x2") || num(el, "y1") === num(el, "y2");
    case "rect":
      return num(el, "width") <= 0 || num(el, "height") <= 0;
    case "polyline":
    case "polygon": {
      const n = (el.getAttribute("points") ?? "").trim().split(/[\s,]+/).filter(Boolean).map(Number);
      const xs: number[] = [];
      const ys: number[] = [];
      for (let i = 0; i + 1 < n.length; i += 2) { xs.push(n[i]); ys.push(n[i + 1]); }
      return collinearOnAxis(xs, ys);
    }
    case "path":
      return isFlatPath(el.getAttribute("d") ?? "");
    default:
      return false;
  }
}

/** Arguments each path command takes per repetition. */
const ARITY: Record<string, number> = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 };

/**
 * Every point a path's box is drawn from — endpoints and control points —
 * collinear on one axis. An arc with both radii non-zero bulges off its chord
 * and is never flat. Malformed data ends the walk with what was read so far,
 * as a browser stops drawing a path at its first error.
 */
export function isFlatPath(d: string): boolean {
  const tokens = d.match(/[a-zA-Z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? [];
  const isCmd = (t: string): boolean => /^[a-zA-Z]$/.test(t);
  const xs: number[] = [];
  const ys: number[] = [];
  let x = 0, y = 0, startX = 0, startY = 0;
  let i = 0;
  let cmd = "";
  while (i < tokens.length) {
    if (isCmd(tokens[i])) cmd = tokens[i++];
    const lower = cmd.toLowerCase();
    const arity = ARITY[lower];
    if (arity === undefined) break;
    if (arity === 0) { x = startX; y = startY; cmd = ""; continue; }
    const a = tokens.slice(i, i + arity);
    if (a.length < arity || a.some(isCmd)) break;
    i += arity;
    const v = a.map(Number);
    const rel = cmd === lower;
    const ox = rel ? x : 0, oy = rel ? y : 0;
    if (lower === "h") x = v[0] + ox;
    else if (lower === "v") y = v[0] + oy;
    else if (lower === "a") {
      if (v[0] !== 0 && v[1] !== 0) return false;
      x = v[5] + ox; y = v[6] + oy;
    } else {
      for (let k = 0; k + 3 < arity; k += 2) { xs.push(v[k] + ox); ys.push(v[k + 1] + oy); }
      x = v[arity - 2] + ox; y = v[arity - 1] + oy;
    }
    xs.push(x); ys.push(y);
    if (lower === "m") {
      startX = x; startY = y;
      cmd = rel ? "l" : "L"; // further pairs after a moveto are linetos
    }
  }
  return collinearOnAxis(xs, ys);
}
