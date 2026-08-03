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

export function nudgeLabels(slots: LabelSlot[]): void {
  slots.sort((a, b) => a.textX - b.textX || a.textY - b.textY);

  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      const a = slots[i], b = slots[j];

      if (b.textY - b.naturalY >= WARDLEY_LABEL_MAX_NUDGE_PX) continue;

      const aW = a.name.length * WARDLEY_CHAR_W_PX;
      const bW = b.name.length * WARDLEY_CHAR_W_PX;
      const aLeft  = a.anchor === "end" ? a.textX - aW : a.textX;
      const aRight = a.anchor === "end" ? a.textX      : a.textX + aW;
      const bLeft  = b.anchor === "end" ? b.textX - bW : b.textX;
      const bRight = b.anchor === "end" ? b.textX      : b.textX + bW;

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
