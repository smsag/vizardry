import type { App, MarkdownPostProcessorContext } from "obsidian";
import type { ConceptMap } from "../types";
import { initCanvas } from "./controls";
import { parseTitle, writeCanvasTitle } from "../shared/title-edit";
import { isEditModeActive } from "../shared/editor";
import { createSvgEl } from "../shared/svg";

const W = 900;
const H = 560;
const PLOT_PAD = 90;
const NODE_H = 34;
const CHAR_W = 7.0;
const NODE_PAD_X = 18;
const NODE_RX = 6;
const ARROW_LEN = 9;
const LABEL_OFFSET = 13;
const NODE_MARGIN = 14; // minimum gap between node edges after layout

interface Vec2 { x: number; y: number; }

function nodeWidth(label: string): number {
  return Math.max(80, Math.ceil(label.length * CHAR_W + NODE_PAD_X * 2));
}

/** Point on the boundary of a rect centered at (cx,cy) in the direction of (tx,ty). */
function rectBoundary(
  cx: number, cy: number, hw: number, hh: number,
  tx: number, ty: number,
): Vec2 {
  const dx = tx - cx, dy = ty - cy;
  if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return { x: cx, y: cy };
  const tX = Math.abs(dx) > 0.01 ? hw / Math.abs(dx) : Infinity;
  const tY = Math.abs(dy) > 0.01 ? hh / Math.abs(dy) : Infinity;
  const t = Math.min(tX, tY);
  return { x: cx + dx * t, y: cy + dy * t };
}

function forceLayout(positions: Vec2[], edgeIdxs: { from: number; to: number }[]): void {
  const n = positions.length;
  if (n <= 1) return;

  const plotW = W - 2 * PLOT_PAD;
  const plotH = H - 2 * PLOT_PAD;
  const k = Math.sqrt((plotW * plotH) / n);

  for (let iter = 0; iter < 250; iter++) {
    const temp = k * (1 - iter / 250);
    const disp: Vec2[] = Array.from({ length: n }, () => ({ x: 0, y: 0 }));

    // Repulsive forces between all node pairs
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = positions[i].x - positions[j].x;
        const dy = positions[i].y - positions[j].y;
        const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const f = k * k / d;
        const ux = (dx / d) * f, uy = (dy / d) * f;
        disp[i].x += ux; disp[i].y += uy;
        disp[j].x -= ux; disp[j].y -= uy;
      }
    }

    // Attractive forces along edges
    for (const { from, to } of edgeIdxs) {
      const dx = positions[from].x - positions[to].x;
      const dy = positions[from].y - positions[to].y;
      const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const f = d * d / k;
      const ux = (dx / d) * f, uy = (dy / d) * f;
      disp[from].x -= ux; disp[from].y -= uy;
      disp[to].x += ux; disp[to].y += uy;
    }

    // Apply with cooling temperature
    for (let i = 0; i < n; i++) {
      const mag = Math.sqrt(disp[i].x ** 2 + disp[i].y ** 2) || 0.01;
      const scale = Math.min(mag, temp) / mag;
      positions[i].x += disp[i].x * scale;
      positions[i].y += disp[i].y * scale;
    }
  }

  // Normalize positions to fill the plot area
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of positions) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const plotW2 = W - 2 * PLOT_PAD;
  const plotH2 = H - 2 * PLOT_PAD;
  const scale = Math.min(plotW2 / spanX, plotH2 / spanY);
  const ox = PLOT_PAD + (plotW2 - spanX * scale) / 2;
  const oy = PLOT_PAD + (plotH2 - spanY * scale) / 2;
  for (const p of positions) {
    p.x = (p.x - minX) * scale + ox;
    p.y = (p.y - minY) * scale + oy;
  }
}

/**
 * Post-layout overlap removal (pixel space).
 * Iteratively pushes any two rectangles apart along the center-to-center
 * direction until every pair has at least NODE_MARGIN px of clearance.
 * Uses the rect's boundary radius in the connecting direction so the push
 * accounts for each node's actual width, not just a circular approximation.
 */
function resolveOverlaps(positions: Vec2[], widths: number[]): void {
  const n = positions.length;
  // Inflate half-dims by half the desired margin so that after separation
  // each edge has NODE_MARGIN/2 clearance → NODE_MARGIN total gap.
  const halfMargin = NODE_MARGIN / 2;
  const hh = NODE_H / 2 + halfMargin;

  for (let iter = 0; iter < 60; iter++) {
    let moved = false;

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const hw_i = widths[i] / 2 + halfMargin;
        const hw_j = widths[j] / 2 + halfMargin;

        const dx = positions[j].x - positions[i].x;
        const dy = positions[j].y - positions[i].y;

        // Fast AABB reject: if they're already clear on either axis, skip.
        if (Math.abs(dx) >= hw_i + hw_j || Math.abs(dy) >= hh * 2) continue;

        const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const ux = dx / d, uy = dy / d;

        // Rectangle "radius" of each node in the direction connecting them.
        // This is the distance from center to rect boundary along (ux, uy).
        const r_i = Math.min(
          Math.abs(ux) > 0.001 ? hw_i / Math.abs(ux) : Infinity,
          Math.abs(uy) > 0.001 ? hh   / Math.abs(uy) : Infinity,
        );
        const r_j = Math.min(
          Math.abs(ux) > 0.001 ? hw_j / Math.abs(ux) : Infinity,
          Math.abs(uy) > 0.001 ? hh   / Math.abs(uy) : Infinity,
        );

        const minSep = r_i + r_j;
        if (d >= minSep) continue;

        // Push each node equally away from the other.
        moved = true;
        const push = (minSep - d) / 2;
        positions[i].x -= ux * push;
        positions[i].y -= uy * push;
        positions[j].x += ux * push;
        positions[j].y += uy * push;
      }
    }

    if (!moved) break;
  }
}

export function renderConceptMap(
  data: ConceptMap,
  container: HTMLElement,
  app?: App,
  ctx?: MarkdownPostProcessorContext,
  source?: string,
): void {
  const defaultTitle = "Concept Map";
  const title = source !== undefined ? parseTitle(source, defaultTitle) : defaultTitle;
  const onTitleEdit = (app && ctx && source !== undefined && isEditModeActive(app))
    ? (newTitle: string) => writeCanvasTitle(app, ctx, container, newTitle, defaultTitle)
    : undefined;
  initCanvas(container, "conceptmap", title, undefined, source, onTitleEdit, app, ctx);

  const wrap = container.createEl("div", { cls: "vzd-cmap-wrap" });

  const svg = createSvgEl("svg", {
    viewBox: `0 0 ${W} ${H}`,
    class: "vzd-cmap-svg",
  }) as SVGSVGElement;

  // ── Arrow marker ──────────────────────────────────────────────────────────
  const defs = createSvgEl("defs");
  const marker = createSvgEl("marker", {
    id: "vzd-cmap-arrow",
    markerWidth: "10", markerHeight: "8",
    refX: "10", refY: "4",
    orient: "auto",
    markerUnits: "userSpaceOnUse",
  });
  const markerPath = createSvgEl("path", { d: "M0,0 L10,4 L0,8 Z", class: "vzd-cmap-arrowhead" });
  marker.appendChild(markerPath);
  defs.appendChild(marker);
  svg.appendChild(defs);

  // ── Layout ────────────────────────────────────────────────────────────────
  const nodeIndex = new Map<string, number>(data.nodes.map((n, i) => [n, i]));
  const n = data.nodes.length;

  const positions: Vec2[] = data.nodes.map((_, i) => {
    const angle = (2 * Math.PI * i) / n - Math.PI / 2;
    return { x: Math.cos(angle) * 200, y: Math.sin(angle) * 200 };
  });

  const edgeIdxs = data.edges.map(e => ({
    from: nodeIndex.get(e.from) ?? 0,
    to: nodeIndex.get(e.to) ?? 0,
  }));

  forceLayout(positions, edgeIdxs);

  const widths = data.nodes.map(n => nodeWidth(n));
  resolveOverlaps(positions, widths);
  const hw = widths.map(w => w / 2);
  const hh = NODE_H / 2;

  // ── Edges ─────────────────────────────────────────────────────────────────
  for (let ei = 0; ei < data.edges.length; ei++) {
    const edge = data.edges[ei];
    const fi = nodeIndex.get(edge.from) ?? 0;
    const ti = nodeIndex.get(edge.to) ?? 0;
    const fp = positions[fi], tp = positions[ti];

    const src = rectBoundary(fp.x, fp.y, hw[fi], hh, tp.x, tp.y);
    const tgt = rectBoundary(tp.x, tp.y, hw[ti], hh, fp.x, fp.y);

    // Shorten line end to make room for arrowhead tip
    const edgeDx = tgt.x - src.x, edgeDy = tgt.y - src.y;
    const edgeLen = Math.sqrt(edgeDx * edgeDx + edgeDy * edgeDy) || 1;
    const ex = tgt.x - (edgeDx / edgeLen) * ARROW_LEN;
    const ey = tgt.y - (edgeDy / edgeLen) * ARROW_LEN;

    const line = createSvgEl("line", {
      x1: String(src.x), y1: String(src.y),
      x2: String(ex), y2: String(ey),
      class: "vzd-cmap-edge",
      "marker-end": "url(#vzd-cmap-arrow)",
    });
    svg.appendChild(line);

    if (edge.label) {
      const mx = (src.x + ex) / 2;
      const my = (src.y + ey) / 2;
      // Perpendicular offset (counterclockwise, so labels stay on consistent side)
      const px = -edgeDy / edgeLen, py = edgeDx / edgeLen;
      const lx = mx + px * LABEL_OFFSET;
      const ly = my + py * LABEL_OFFSET;
      const labelW = Math.ceil(edge.label.length * 6.2 + 12);

      const bgRect = createSvgEl("rect", {
        x: String(lx - labelW / 2), y: String(ly - 9),
        width: String(labelW), height: "16",
        rx: "3",
        class: "vzd-cmap-edge-label-bg",
      });
      svg.appendChild(bgRect);

      const labelEl = createSvgEl("text", {
        x: String(lx), y: String(ly),
        class: "vzd-cmap-edge-label",
        "text-anchor": "middle",
        "dominant-baseline": "central",
      });
      labelEl.textContent = edge.label;
      svg.appendChild(labelEl);
    }
  }

  // ── Nodes ─────────────────────────────────────────────────────────────────
  for (let i = 0; i < n; i++) {
    const { x, y } = positions[i];
    const w = widths[i];

    const rect = createSvgEl("rect", {
      x: String(x - w / 2), y: String(y - hh),
      width: String(w), height: String(NODE_H),
      rx: String(NODE_RX),
      class: "vzd-cmap-node",
    });
    svg.appendChild(rect);

    const label = createSvgEl("text", {
      x: String(x), y: String(y),
      class: "vzd-cmap-node-label",
      "text-anchor": "middle",
      "dominant-baseline": "central",
    });
    label.textContent = data.nodes[i];
    svg.appendChild(label);
  }

  wrap.appendChild(svg);
}
