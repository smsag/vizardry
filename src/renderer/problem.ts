import type { FlowData, FlowNode, StageDef } from "../types/problem";
import type { RenderContext } from "./render-context";
import { initCanvas, renderCanvasWarnings, renderHeadingLink } from "./controls";
import { parseTitle, writeCanvasTitle } from "../shared/title-edit";
import { isEditModeActive } from "../shared/editor";
import { createSvgEl } from "../shared/svg";
import { estimateCharsPerLine, wrappedLineCount } from "../shared/svg-box";
import { rectBoundary } from "../shared/geometry";

// ── Layout constants (SVG user units) ────────────────────────────────────────
const PAD = 24;          // outer padding around the whole graph
const CARD_W = 208;      // fixed card width
const COL_GAP = 72;      // horizontal gap between stage columns (room for arrows)
const CARD_GAP = 18;     // vertical gap between stacked cards in a column
const CARD_PAD_X = 13;
const CARD_PAD_TOP = 11;
const CARD_PAD_BOTTOM = 13;
const EYEBROW_H = 15;
const HEADING_LINE_H = 20;
const BODY_LINE_H = 18;
const HEADING_BODY_GAP = 5;
const CHAR_W = 7;
const MARKER_ID = "vzd-flow-arrow";

interface Placed extends FlowNode {
  role: StageDef["role"];
  x: number; y: number; w: number; h: number;
}

function cardHeight(node: FlowNode): number {
  const contentW = CARD_W - CARD_PAD_X * 2;
  const cpl = estimateCharsPerLine(contentW, { charW: CHAR_W, min: 10 });
  const headingLines = node.heading ? Math.max(1, wrappedLineCount(node.heading, cpl)) : 0;
  const bodyLines = node.body ? wrappedLineCount(node.body, cpl) : 0;
  let h = CARD_PAD_TOP + EYEBROW_H;
  if (headingLines) h += headingLines * HEADING_LINE_H;
  if (bodyLines) h += HEADING_BODY_GAP + bodyLines * BODY_LINE_H;
  return h + CARD_PAD_BOTTOM;
}

/**
 * Assigns each node an (x, y, w, h). Stages with no nodes are skipped so empty
 * columns don't leave gaps; present stages keep their arc order left→right.
 * Within a column, nodes stack top-to-bottom in source order.
 */
function layout(data: FlowData): { placed: Placed[]; width: number; height: number } {
  const roleByStage = new Map(data.stages.map(s => [s.key, s.role]));
  const presentStages = data.stages.filter(s => data.nodes.some(n => n.stage === s.key));

  const placed: Placed[] = [];
  let maxBottom = PAD;

  presentStages.forEach((stage, colIdx) => {
    const x = PAD + colIdx * (CARD_W + COL_GAP);
    let y = PAD;
    for (const node of data.nodes.filter(n => n.stage === stage.key)) {
      const h = cardHeight(node);
      placed.push({ ...node, role: roleByStage.get(node.stage) ?? "neutral", x, y, w: CARD_W, h });
      y += h + CARD_GAP;
    }
    maxBottom = Math.max(maxBottom, y - CARD_GAP);
  });

  const width = PAD * 2 + presentStages.length * CARD_W + Math.max(0, presentStages.length - 1) * COL_GAP;
  const height = maxBottom + PAD;
  return { placed, width, height };
}

function renderMarker(svg: SVGElement): void {
  const defs = createSvgEl("defs");
  const marker = createSvgEl("marker", {
    id: MARKER_ID, markerWidth: "9", markerHeight: "9",
    refX: "7", refY: "3", orient: "auto", markerUnits: "userSpaceOnUse",
  });
  marker.appendChild(createSvgEl("path", { d: "M0,0 L0,6 L8,3 z", class: "vzd-flow-arrowhead" }));
  defs.appendChild(marker);
  svg.appendChild(defs);
}

/** Cubic-bezier arrow from source-edge to target-edge, curving along whichever
 *  axis dominates so cross-column links read horizontal and same-column links
 *  read as a vertical arc. */
function drawEdge(svg: SVGElement, from: Placed, to: Placed): void {
  const fc = { x: from.x + from.w / 2, y: from.y + from.h / 2 };
  const tc = { x: to.x + to.w / 2, y: to.y + to.h / 2 };
  const s = rectBoundary(fc.x, fc.y, from.w / 2, from.h / 2, tc.x, tc.y);
  const t = rectBoundary(tc.x, tc.y, to.w / 2, to.h / 2, fc.x, fc.y);

  const dx = t.x - s.x, dy = t.y - s.y;
  let d: string;
  if (Math.abs(dx) >= Math.abs(dy)) {
    const k = Math.max(Math.abs(dx) * 0.5, 24) * Math.sign(dx || 1);
    d = `M${s.x},${s.y} C${s.x + k},${s.y} ${t.x - k},${t.y} ${t.x},${t.y}`;
  } else {
    const k = Math.max(Math.abs(dy) * 0.5, 24) * Math.sign(dy || 1);
    d = `M${s.x},${s.y} C${s.x},${s.y + k} ${t.x},${t.y - k} ${t.x},${t.y}`;
  }
  svg.appendChild(createSvgEl("path", { d, class: "vzd-flow-edge", "marker-end": `url(#${MARKER_ID})` }));
}

function renderCard(
  svg: SVGElement,
  node: Placed,
  eyebrow: string,
  rc: RenderContext,
): void {
  const g = createSvgEl("g", { class: "vzd-flow-node-g" });
  svg.appendChild(g);

  g.appendChild(createSvgEl("rect", {
    x: String(node.x), y: String(node.y), width: String(node.w), height: String(node.h),
    rx: "9", class: `vzd-flow-card vzd-flow-card--${node.role}`,
  }));

  const fo = createSvgEl("foreignObject", {
    x: String(node.x), y: String(node.y), width: String(node.w), height: String(node.h),
  });
  const host = document.createElement("div");
  host.className = "vzd-flow-card-host";

  host.createEl("div", { cls: "vzd-flow-eyebrow", text: eyebrow });

  if (node.heading) {
    const headEl = host.createEl("div", { cls: "vzd-flow-heading", text: node.heading });
    // Same-doc chapter link + section preview when the heading resolves.
    renderHeadingLink(headEl, node.heading, rc.resolver, rc.navigateTo, rc.app, rc.ctx?.sourcePath);
  }
  if (node.body) {
    host.createEl("div", { cls: "vzd-flow-body", text: node.body });
  }

  fo.appendChild(host);
  g.appendChild(fo);
}

export function renderProblem(
  data: FlowData,
  container: HTMLElement,
  rc: RenderContext = {},
): void {
  const { app, ctx, source } = rc;
  const isEditMode = !!(app && ctx && isEditModeActive(app));
  const defaultTitle = "Problem Statement";
  const title = source !== undefined ? parseTitle(source, defaultTitle) : defaultTitle;
  const onTitleEdit = (isEditMode && source !== undefined)
    ? (newTitle: string) => writeCanvasTitle(app!, ctx!, container, newTitle, defaultTitle)
    : undefined;
  initCanvas(container, "problem", title, undefined, source, onTitleEdit, app, ctx);

  const wrap = container.createEl("div", { cls: "vzd-flow-wrap" });

  const { placed, width, height } = layout(data);
  const byId = new Map(placed.map(p => [p.id, p]));
  const eyebrowByStage = new Map(data.stages.map(s => [s.key, s.eyebrow]));

  const svg = createSvgEl("svg", {
    viewBox: `0 0 ${width} ${height}`,
    width: String(width),
    height: String(height),
    class: "vzd-flow-svg",
  });

  renderMarker(svg);

  // Edges first so cards paint over the arrow tails.
  for (const edge of data.edges) {
    const from = byId.get(edge.from), to = byId.get(edge.to);
    if (from && to) drawEdge(svg, from, to);
  }
  for (const node of placed) {
    renderCard(svg, node, eyebrowByStage.get(node.stage) ?? "", rc);
  }

  wrap.appendChild(svg);
  renderCanvasWarnings(container, data.warnings);
}
