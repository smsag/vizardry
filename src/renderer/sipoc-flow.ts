import type { App, MarkdownPostProcessorContext } from "obsidian";
import type { SIPOCColumn, SIPOCFlowData, SIPOCFlowNode, SIPOCNodeShape } from "../types";
import { t } from "../i18n";
import { initCanvas } from "./controls";
import { parseTitle, writeCanvasTitle } from "../shared/title-edit";
import { createSvgEl } from "../shared/svg";
import { SIPOC_FLOW_LABEL_MAX_CHARS } from "../shared/constants";

// ── Layout constants ───────────────────────────────────────────────────────

const COLS: SIPOCColumn[] = ["suppliers", "inputs", "process", "outputs", "customers"];
function colLabels(): Record<SIPOCColumn, string> {
  return {
    suppliers: t("sipoc.col.suppliers"),
    inputs:    t("sipoc.col.inputs"),
    process:   t("sipoc.col.process"),
    outputs:   t("sipoc.col.outputs"),
    customers: t("sipoc.col.customers"),
  };
}

const W = 900;
const HEADER_H = 44;
const PAD = { top: 16, right: 0, bottom: 20, left: 0 };
const COL_W = (W - PAD.left - PAD.right) / COLS.length; // 180
const ROW_H = 68;
const NODE_W = 120;
const NODE_H = 36;
const PARA_SKEW = 10; // horizontal skew for parallelogram
const MARKER_ID = "vzd-sipoc-flow-arrow";

// ── Geometry helpers ───────────────────────────────────────────────────────

function colCx(colIdx: number): number {
  return PAD.left + (colIdx + 0.5) * COL_W;
}

function nodeY(idx: number, count: number, plotH: number): number {
  return HEADER_H + PAD.top + (plotH * (idx + 0.5)) / count;
}

/** Right-edge connection point of a node (for outgoing arrows). */
function rightPort(cx: number, cy: number, shape: SIPOCNodeShape): { x: number; y: number } {
  const skew = shape === "parallelogram" ? PARA_SKEW : 0;
  return { x: cx + NODE_W / 2 + skew, y: cy };
}

/** Left-edge connection point of a node (for incoming arrows). */
function leftPort(cx: number, cy: number, shape: SIPOCNodeShape): { x: number; y: number } {
  const skew = shape === "parallelogram" ? PARA_SKEW : 0;
  return { x: cx - NODE_W / 2 - skew, y: cy };
}

/** Bottom-centre connection point (for downward same-column arrows). */
function bottomPort(cx: number, cy: number): { x: number; y: number } {
  return { x: cx, y: cy + NODE_H / 2 };
}

/** Top-centre connection point (for upward same-column arrows). */
function topPort(cx: number, cy: number): { x: number; y: number } {
  return { x: cx, y: cy - NODE_H / 2 };
}

// ── Shape drawing ──────────────────────────────────────────────────────────

function drawNode(
  svg: SVGElement,
  cx: number,
  cy: number,
  label: string,
  shape: SIPOCNodeShape,
  isAnchor: boolean,
): void {
  const cls = `vzd-sf-node${isAnchor ? " vzd-sf-node--accent" : ""}`;

  if (shape === "ellipse") {
    const el = createSvgEl("ellipse", {
      cx: String(cx), cy: String(cy),
      rx: String(NODE_W / 2), ry: String(NODE_H / 2),
      class: cls,
    });
    svg.appendChild(el);

  } else if (shape === "parallelogram") {
    const hw = NODE_W / 2;
    const hh = NODE_H / 2;
    const s = PARA_SKEW;
    const pts = [
      `${cx - hw + s},${cy - hh}`,
      `${cx + hw + s},${cy - hh}`,
      `${cx + hw - s},${cy + hh}`,
      `${cx - hw - s},${cy + hh}`,
    ].join(" ");
    const poly = createSvgEl("polygon", { points: pts, class: cls });
    svg.appendChild(poly);

  } else if (shape === "diamond") {
    const hw = NODE_W / 2;
    const hh = NODE_H / 2;
    const pts = [
      `${cx},${cy - hh}`,
      `${cx + hw},${cy}`,
      `${cx},${cy + hh}`,
      `${cx - hw},${cy}`,
    ].join(" ");
    svg.appendChild(createSvgEl("polygon", { points: pts, class: cls }));

  } else if (shape === "circle") {
    svg.appendChild(createSvgEl("circle", {
      cx: String(cx), cy: String(cy),
      r: String(NODE_H / 2),
      class: cls,
    }));

  } else if (shape === "trapezoid") {
    const hw = NODE_W / 2;
    const hh = NODE_H / 2;
    const s = PARA_SKEW;
    const pts = [
      `${cx - hw + s},${cy - hh}`,
      `${cx + hw - s},${cy - hh}`,
      `${cx + hw},${cy + hh}`,
      `${cx - hw},${cy + hh}`,
    ].join(" ");
    svg.appendChild(createSvgEl("polygon", { points: pts, class: cls }));

  } else if (shape === "hexagon") {
    const hw = NODE_W / 2;
    const hh = NODE_H / 2;
    const tip = hw * 0.25; // horizontal offset of the side tips
    const pts = [
      `${cx - hw},${cy}`,
      `${cx - hw + tip},${cy - hh}`,
      `${cx + hw - tip},${cy - hh}`,
      `${cx + hw},${cy}`,
      `${cx + hw - tip},${cy + hh}`,
      `${cx - hw + tip},${cy + hh}`,
    ].join(" ");
    svg.appendChild(createSvgEl("polygon", { points: pts, class: cls }));

  } else if (shape === "pentagon") {
    // Right-pointing arrow chevron (predefined-process convention)
    const hw = NODE_W / 2;
    const hh = NODE_H / 2;
    const tip = hw * 0.25;
    const pts = [
      `${cx - hw},${cy - hh}`,
      `${cx + hw - tip},${cy - hh}`,
      `${cx + hw},${cy}`,
      `${cx + hw - tip},${cy + hh}`,
      `${cx - hw},${cy + hh}`,
    ].join(" ");
    svg.appendChild(createSvgEl("polygon", { points: pts, class: cls }));

  } else if (shape === "cylinder") {
    const CAP_RY = 5;
    const hw = NODE_W / 2;
    const hh = NODE_H / 2;
    // body rect (no top/bottom rounding — caps provide the shape)
    svg.appendChild(createSvgEl("rect", {
      x: String(cx - hw), y: String(cy - hh),
      width: String(NODE_W), height: String(NODE_H),
      class: cls,
    }));
    // bottom cap (drawn first so top cap overlaps it)
    svg.appendChild(createSvgEl("ellipse", {
      cx: String(cx), cy: String(cy + hh),
      rx: String(hw), ry: String(CAP_RY),
      class: cls,
    }));
    // top cap
    svg.appendChild(createSvgEl("ellipse", {
      cx: String(cx), cy: String(cy - hh),
      rx: String(hw), ry: String(CAP_RY),
      class: cls,
    }));

  } else if (shape === "document") {
    const hw = NODE_W / 2;
    const hh = NODE_H / 2;
    const waveH = 6; // amplitude of the wavy bottom
    // Path: top-left → top-right → bottom-right → wavy bottom → close
    const d = [
      `M${cx - hw},${cy - hh}`,
      `H${cx + hw}`,
      `V${cy + hh - waveH}`,
      // one full sine-wave approximation via two cubic beziers
      `C${cx + hw * 0.75},${cy + hh + waveH} ${cx + hw * 0.25},${cy + hh - waveH} ${cx},${cy + hh}`,
      `C${cx - hw * 0.25},${cy + hh + waveH} ${cx - hw * 0.75},${cy + hh - waveH} ${cx - hw},${cy + hh - waveH}`,
      "Z",
    ].join(" ");
    svg.appendChild(createSvgEl("path", { d, class: cls }));

  } else {
    // rect (default)
    const rect = createSvgEl("rect", {
      x: String(cx - NODE_W / 2), y: String(cy - NODE_H / 2),
      width: String(NODE_W), height: String(NODE_H),
      rx: "4",
      class: cls,
    });
    svg.appendChild(rect);
  }

  // Label — truncate long text
  const displayLabel = label.length > SIPOC_FLOW_LABEL_MAX_CHARS ? label.slice(0, SIPOC_FLOW_LABEL_MAX_CHARS - 1) + "…" : label;
  const text = createSvgEl("text", {
    x: String(cx), y: String(cy),
    class: "vzd-sf-label",
    "text-anchor": "middle",
    "dominant-baseline": "central",
  });
  text.textContent = displayLabel;

  // title tooltip for full label when truncated
  if (label.length > SIPOC_FLOW_LABEL_MAX_CHARS) {
    const title = createSvgEl("title");
    title.textContent = label;
    text.appendChild(title);
  }

  svg.appendChild(text);
}

// ── Arrow routing ──────────────────────────────────────────────────────────

/**
 * Draws a cubic-bezier arrow from (x1,y1) to (x2,y2).
 *
 * Horizontal mode (cross-column): control points pull along the x-axis.
 * Vertical mode (same-column): control points pull along the y-axis so the
 * curve reads as a clean downward/upward arc within the column band.
 */
function drawArrow(
  svg: SVGElement,
  x1: number, y1: number,
  x2: number, y2: number,
  direction: "right" | "left" | "vertical",
): void {
  let d: string;

  if (direction === "vertical") {
    const tension = Math.max(Math.abs(y2 - y1) * 0.45, 20);
    const goingDown = y2 >= y1;
    const cp1y = goingDown ? y1 + tension : y1 - tension;
    const cp2y = goingDown ? y2 - tension : y2 + tension;
    d = `M${x1},${y1} C${x1},${cp1y} ${x2},${cp2y} ${x2},${y2}`;
  } else {
    const tension = Math.abs(x2 - x1) * 0.45;
    const cp1x = direction === "right" ? x1 + tension : x1 - tension;
    const cp2x = direction === "right" ? x2 - tension : x2 + tension;
    d = `M${x1},${y1} C${cp1x},${y1} ${cp2x},${y2} ${x2},${y2}`;
  }

  const path = createSvgEl("path", {
    d,
    class: "vzd-sf-link",
    "marker-end": `url(#${MARKER_ID})`,
  });
  svg.appendChild(path);
}

// ── Main renderer ──────────────────────────────────────────────────────────

export function renderSIPOCFlow(
  data: SIPOCFlowData,
  container: HTMLElement,
  source?: string,
  app?: App,
  ctx?: MarkdownPostProcessorContext,
): void {
  const defaultTitle = "SIPOC Flow Diagram";
  const title = source !== undefined ? parseTitle(source, defaultTitle) : defaultTitle;
  const onTitleEdit = (app && ctx && source !== undefined)
    ? (newTitle: string) => writeCanvasTitle(app, ctx, container, newTitle, defaultTitle)
    : undefined;
  initCanvas(container, "sipoc", title, undefined, source, onTitleEdit);

  const wrap = container.createEl("div", { cls: "vzd-sipoc-flow-wrap" });

  // Determine height from the tallest column
  const colCounts = COLS.map(col => data.nodes.filter(n => n.column === col).length);
  const maxNodes = Math.max(...colCounts, 1);
  const plotH = maxNodes * ROW_H;
  const H = HEADER_H + PAD.top + plotH + PAD.bottom;

  const svg = createSvgEl("svg", {
    viewBox: `0 0 ${W} ${H}`,
    class: "vzd-sipoc-flow-svg",
  });

  // ── Defs: arrowhead marker ─────────────────────────────────────────────
  const defs = createSvgEl("defs");
  const marker = createSvgEl("marker", {
    id: MARKER_ID,
    markerWidth: "8", markerHeight: "8",
    refX: "7", refY: "3",
    orient: "auto",
  });
  const mPath = createSvgEl("path", { d: "M0,0 L0,6 L8,3 z", class: "vzd-sf-arrowhead" });
  marker.appendChild(mPath);
  defs.appendChild(marker);
  svg.appendChild(defs);

  // ── Column bands and headers ───────────────────────────────────────────
  COLS.forEach((col, i) => {
    const x = PAD.left + i * COL_W;

    const band = createSvgEl("rect", {
      x: String(x), y: "0",
      width: String(COL_W), height: String(H),
      class: `vzd-sf-band vzd-sf-band--${col}`,
    });
    svg.appendChild(band);

    const divider = createSvgEl("line", {
      x1: String(x), y1: "0",
      x2: String(x), y2: String(H),
      class: "vzd-sf-divider",
    });
    svg.appendChild(divider);

    const headerRect = createSvgEl("rect", {
      x: String(x), y: "0",
      width: String(COL_W), height: String(HEADER_H),
      class: `vzd-sf-header vzd-sf-header--${col}`,
    });
    svg.appendChild(headerRect);

    const headerText = createSvgEl("text", {
      x: String(x + COL_W / 2), y: String(HEADER_H / 2),
      class: "vzd-sf-header-label",
      "text-anchor": "middle",
      "dominant-baseline": "central",
    });
    headerText.textContent = colLabels()[col];
    svg.appendChild(headerText);
  });

  // ── Build position map ─────────────────────────────────────────────────
  // Map nodeId → {cx, cy} for link drawing
  const posMap = new Map<string, { cx: number; cy: number; shape: SIPOCNodeShape }>();

  COLS.forEach((col, colIdx) => {
    const colNodes = data.nodes.filter(n => n.column === col);
    const cx = colCx(colIdx);
    colNodes.forEach((node, idx) => {
      const cy = nodeY(idx, Math.max(colNodes.length, 1), plotH);
      posMap.set(node.id, { cx, cy, shape: node.shape });
    });
  });

  // ── Draw links (behind nodes) ──────────────────────────────────────────
  const colIndex = Object.fromEntries(COLS.map((c, i) => [c, i])) as Record<SIPOCColumn, number>;

  for (const link of data.links) {
    const from = posMap.get(link.from);
    const to = posMap.get(link.to);
    if (!from || !to) continue;

    const fromNode = data.nodes.find(n => n.id === link.from)!;
    const toNode = data.nodes.find(n => n.id === link.to)!;

    let src: { x: number; y: number };
    let dst: { x: number; y: number };
    let direction: "right" | "left" | "vertical";

    if (fromNode.column === toNode.column) {
      const goingDown = from.cy <= to.cy;
      src = goingDown ? bottomPort(from.cx, from.cy) : topPort(from.cx, from.cy);
      dst = goingDown ? topPort(to.cx, to.cy)        : bottomPort(to.cx, to.cy);
      direction = "vertical";
    } else {
      const goingRight = colIndex[fromNode.column] < colIndex[toNode.column];
      src = goingRight ? rightPort(from.cx, from.cy, from.shape) : leftPort(from.cx, from.cy, from.shape);
      dst = goingRight ? leftPort(to.cx, to.cy, to.shape)        : rightPort(to.cx, to.cy, to.shape);
      direction = goingRight ? "right" : "left";
    }

    drawArrow(svg, src.x, src.y, dst.x, dst.y, direction);
  }

  // ── Draw nodes (on top of links) ──────────────────────────────────────
  for (const node of data.nodes) {
    const pos = posMap.get(node.id)!;
    const isAccent = node.column === "process";
    drawNode(svg, pos.cx, pos.cy, node.label, node.shape, isAccent);
  }

  wrap.appendChild(svg);
}
