/**
 * Pure geometry + coordinate math for the Wardley Map renderer.
 *
 * No DOM construction or Obsidian dependency (beyond reading label-metric
 * constants), so it can be shared by both the static renderer (wardley.ts) and
 * the interaction behaviours (wardley-interactions.ts) without a cycle, and
 * unit-tested in isolation.
 */

import type { WardleyComponent } from "../types";
import {
  WARDLEY_CHAR_W_PX, WARDLEY_LABEL_MIN_GAP_PX, WARDLEY_LABEL_OVERLAP_X_PX, WARDLEY_LABEL_MAX_NUDGE_PX,
} from "../shared/constants";

// Canvas dimensions
export const W = 800;
export const H = 520;
export const PAD = { top: 20, right: 30, bottom: 60, left: 60 };

// Plot area
export const PLOT_X = PAD.left;
export const PLOT_Y = PAD.top;
export const PLOT_W = W - PAD.left - PAD.right;
export const PLOT_H = H - PAD.top - PAD.bottom;

export const NODE_R = 8;

// ── Shared refs (produced by the static renderer, consumed by interactions) ──

export type NodeRef = { circle: SVGCircleElement; textEl: SVGTextElement; comp: WardleyComponent };
/** The draggable "to-be" marker of an evolution arrow. `fromX` is the current
 *  node's svg-x (the arrow tail); `y` is the fixed visibility row. */
export type EvolveRef = { circle: SVGCircleElement; line: SVGLineElement; comp: WardleyComponent; fromX: number; y: number };

/**
 * Positions are per-label right edges (`parseWardleyMap` requires each value
 * strictly < 1), so used verbatim the last stage would stop short of
 * evolution = 1, leaving a permanently unstyled sliver past it. The last
 * edge is therefore always the canvas boundary (1), not the user's value.
 */
export function stageEdgesFromPositions(positions: number[]): number[] {
  if (positions.length === 0) return [0, 1];
  return [0, ...positions.slice(0, -1), 1];
}

export function toSvgX(evolution: number): number {
  return PLOT_X + evolution * PLOT_W;
}

export function toSvgY(visibility: number): number {
  return PLOT_Y + (1 - visibility) * PLOT_H;
}

export function svgToData(svgX: number, svgY: number): { visibility: number; evolution: number } {
  return {
    evolution:  Math.max(0, Math.min(1, (svgX - PLOT_X) / PLOT_W)),
    visibility: Math.max(0, Math.min(1, 1 - (svgY - PLOT_Y) / PLOT_H)),
  };
}

/** Convert client (screen) coordinates to the SVG's own coordinate space. */
export function clientToSvg(svg: SVGSVGElement, clientX: number, clientY: number): { x: number; y: number } {
  const ctm = svg.getScreenCTM();
  if (ctm && typeof DOMPoint !== "undefined") {
    const point = new DOMPoint(clientX, clientY) as DOMPoint & { matrixTransform?: (m: DOMMatrix) => DOMPoint };
    if (typeof point.matrixTransform === "function") {
      const pt = point.matrixTransform(ctm.inverse());
      return { x: pt.x, y: pt.y };
    }
  }

  // Fallback for environments (for example happy-dom tests) where DOMPoint
  // does not implement matrixTransform.
  const rect = svg.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 };
  return {
    x: ((clientX - rect.left) / rect.width) * W,
    y: ((clientY - rect.top) / rect.height) * H,
  };
}

/**
 * Base anchor direction for a label based on its map quadrant.
 * Right-side nodes get right-aligned text to the left of the node;
 * left-side nodes get left-aligned text to the right.
 */
export function labelAnchor(evo: number, vis: number): { dx: number; dy: number; anchor: string } {
  const right = evo > 0.5;
  const top   = vis > 0.5;
  return {
    dx: right ? -(NODE_R + 4) : NODE_R + 4,
    dy: top   ? -(NODE_R + 4) : NODE_R + 12,
    anchor: right ? "end" : "start",
  };
}

export interface LabelSlot {
  componentIndex: number;
  textX: number;
  textY: number;
  /** Natural (pre-nudge) y — used to detect displacement and draw leader lines. */
  naturalY: number;
  anchor: string;
  name: string;
}

// ── Collision-aware label placement ──────────────────────────────────────────

/** Axis-aligned box in svg units. */
export interface Box { x1: number; y1: number; x2: number; y2: number }
/** Line segment in svg units (a link, an evolution arrow). */
export interface Segment { x1: number; y1: number; x2: number; y2: number }

/** What a label should keep clear of. */
export interface LabelObstacles {
  segments: Segment[];
  /** Nodes, pipeline boxes, pipeline sub-labels — anything drawn as a block. */
  boxes: Box[];
}

export interface LabelNode {
  componentIndex: number;
  cx: number;
  cy: number;
  evo: number;
  vis: number;
  name: string;
}

/** Cap height and descender of the 12px label font, for its box. */
const LABEL_ASCENT = 10;
const LABEL_DESCENT = 3;
/** How far (svg units) a label box may cross the canvas edge before it counts as off it. */
const EDGE_SLACK = 4;

/** The box a label of `name` occupies when drawn at (x, y) with `anchor`. */
export function labelBox(name: string, x: number, y: number, anchor: string): Box {
  const w = name.length * WARDLEY_CHAR_W_PX;
  const x1 = anchor === "end" ? x - w : anchor === "middle" ? x - w / 2 : x;
  return { x1, y1: y - LABEL_ASCENT, x2: x1 + w, y2: y + LABEL_DESCENT };
}

const boxesOverlap = (a: Box, b: Box): boolean =>
  a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;

/** True if the segment passes through the box (either end inside, or it
 *  crosses one of the box's edges). */
export function segmentHitsBox(s: Segment, b: Box): boolean {
  const inside = (x: number, y: number): boolean => x >= b.x1 && x <= b.x2 && y >= b.y1 && y <= b.y2;
  if (inside(s.x1, s.y1) || inside(s.x2, s.y2)) return true;
  // Liang–Barsky clip: does any part of the segment fall inside the box?
  const dx = s.x2 - s.x1, dy = s.y2 - s.y1;
  let t0 = 0, t1 = 1;
  const edges: [number, number][] = [[-dx, s.x1 - b.x1], [dx, b.x2 - s.x1], [-dy, s.y1 - b.y1], [dy, b.y2 - s.y1]];
  for (const [p, q] of edges) {
    if (p === 0) { if (q < 0) return false; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
    else { if (r < t0) return false; if (r < t1) t1 = r; }
  }
  return t0 <= t1;
}

/** Candidate spots around a node, the quadrant default first so it wins ties. */
function labelCandidates(n: LabelNode): { x: number; y: number; anchor: string; cost: number }[] {
  const d = labelAnchor(n.evo, n.vis);
  const g = NODE_R + 4;
  return [
    { x: n.cx + d.dx, y: n.cy + d.dy, anchor: d.anchor, cost: 0 },
    { x: n.cx + g, y: n.cy - g, anchor: "start", cost: 1 },
    { x: n.cx - g, y: n.cy - g, anchor: "end", cost: 1 },
    { x: n.cx + g, y: n.cy + NODE_R + 12, anchor: "start", cost: 1 },
    { x: n.cx - g, y: n.cy + NODE_R + 12, anchor: "end", cost: 1 },
    { x: n.cx + g + 1, y: n.cy + 4, anchor: "start", cost: 2 },
    { x: n.cx - g - 1, y: n.cy + 4, anchor: "end", cost: 2 },
    { x: n.cx, y: n.cy - NODE_R - 6, anchor: "middle", cost: 3 },
    { x: n.cx, y: n.cy + NODE_R + 15, anchor: "middle", cost: 3 },
  ];
}

/**
 * Picks each component's label position from the spots around its node,
 * scoring every spot by what its box would cover: a link or evolution arrow
 * running through the text, another node or a pipeline, a label already
 * placed, or the edge of the canvas. The quadrant default (labelAnchor) wins
 * whenever it is clear, so maps that were readable keep their layout; a
 * crowded spot gives way to the cleanest alternative instead of printing the
 * name over a line. Labels are placed top-down, so the upper ones settle first.
 *
 * Returns slots ready for nudgeLabels, which still separates what no spot
 * could (a cluster of components on one point).
 */
export function placeLabels(nodes: LabelNode[], obstacles: LabelObstacles): LabelSlot[] {
  const placed: Box[] = [];
  const order = [...nodes].sort((a, b) => a.cy - b.cy || a.cx - b.cx);
  const slots: LabelSlot[] = [];
  for (const n of order) {
    const ownBox: Box = { x1: n.cx - NODE_R, y1: n.cy - NODE_R, x2: n.cx + NODE_R, y2: n.cy + NODE_R };
    let best: { x: number; y: number; anchor: string } | null = null;
    let bestScore = Infinity;
    for (const c of labelCandidates(n)) {
      const box = labelBox(n.name, c.x, c.y, c.anchor);
      let score = c.cost;
      // A few units of slack: the box is a generous estimate, and a label on a
      // top-edge node has always drawn its ascenders just past the frame.
      if (box.x1 < -EDGE_SLACK || box.x2 > W + EDGE_SLACK || box.y1 < -EDGE_SLACK || box.y2 > H + EDGE_SLACK) score += 1000;
      for (const s of obstacles.segments) if (segmentHitsBox(s, box)) score += 100;
      // The node's own circle (and a pipeline it sits on) is what the label
      // names, not something to keep clear of.
      for (const b of obstacles.boxes) if (boxesOverlap(b, box) && !boxesOverlap(b, ownBox)) score += 100;
      for (const b of placed) if (boxesOverlap(b, box)) score += 200;
      if (score < bestScore) { bestScore = score; best = c; }
    }
    const pick = best!;
    placed.push(labelBox(n.name, pick.x, pick.y, pick.anchor));
    slots.push({ componentIndex: n.componentIndex, textX: pick.x, textY: pick.y, naturalY: pick.y, anchor: pick.anchor, name: n.name });
  }
  return slots;
}

export function nudgeLabels(slots: LabelSlot[]): void {
  slots.sort((a, b) => a.textX - b.textX || a.textY - b.textY);

  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      const a = slots[i], b = slots[j];

      if (b.textY - b.naturalY >= WARDLEY_LABEL_MAX_NUDGE_PX) continue;

      const { x1: aLeft, x2: aRight } = labelBox(a.name, a.textX, a.textY, a.anchor);
      const { x1: bLeft, x2: bRight } = labelBox(b.name, b.textX, b.textY, b.anchor);

      if (aRight + WARDLEY_LABEL_OVERLAP_X_PX < bLeft || bRight + WARDLEY_LABEL_OVERLAP_X_PX < aLeft) continue;

      const gap = b.textY - a.textY;
      if (gap < WARDLEY_LABEL_MIN_GAP_PX) {
        const push = WARDLEY_LABEL_MIN_GAP_PX - gap;
        const remaining = WARDLEY_LABEL_MAX_NUDGE_PX - (b.textY - b.naturalY);
        b.textY += Math.min(push, Math.max(0, remaining));
      }
    }
  }
}

/**
 * Trimmed endpoints for an evolution arrow so it stops short of both the source
 * node and the to-be marker. When the two are closer than both trims combined,
 * trimming would flip the segment backwards (a degenerate reversed arrow), so
 * the line is collapsed to a point at the marker instead.
 */
export function evolveLineEndpoints(fromX: number, toX: number): { x1: number; x2: number } {
  const trim = NODE_R + 2;
  if (Math.abs(toX - fromX) <= trim * 2) return { x1: toX, x2: toX };
  const dir = Math.sign(toX - fromX);
  return { x1: fromX + dir * trim, x2: toX - dir * trim };
}
