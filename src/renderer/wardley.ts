import type { WardleyMap, WardleyComponent } from "../types";
import { initCanvas } from "./controls";
import { createSvgEl } from "../shared/svg";

// Canvas dimensions
const W = 800;
const H = 520;
const PAD = { top: 20, right: 30, bottom: 60, left: 60 };

// Plot area
const PLOT_X = PAD.left;
const PLOT_Y = PAD.top;
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

const EVOLUTION_STAGES = ["Genesis", "Custom", "Product", "Commodity"];
const NODE_R = 8;

function toSvgX(evolution: number): number {
  return PLOT_X + evolution * PLOT_W;
}

function toSvgY(visibility: number): number {
  // visibility 1 → top, 0 → bottom
  return PLOT_Y + (1 - visibility) * PLOT_H;
}

/**
 * Nudge label positions to reduce overlap.
 * Each label gets an anchor direction based on its quadrant so most labels
 * sit outside the node rather than over each other.
 */
function labelAnchor(evo: number, vis: number): { dx: number; dy: number; anchor: string } {
  const right = evo > 0.5;
  const top   = vis > 0.5;
  return {
    dx: right ? -(NODE_R + 4) : NODE_R + 4,
    dy: top   ? -(NODE_R + 4) : NODE_R + 12,
    anchor: right ? "end" : "start",
  };
}

export function renderWardleyMap(data: WardleyMap, container: HTMLElement): void {
  initCanvas(container, "wardley", "Wardley Map");

  const wrap = container.createEl("div", { cls: "vzd-wardley-wrap" });

  const svg = createSvgEl("svg", {
    viewBox: `0 0 ${W} ${H}`,
    class: "vzd-wardley-svg",
  });

  // ── Defs (arrow marker) ────────────────────────────────────────────────
  const defs = createSvgEl("defs");
  const marker = createSvgEl("marker", {
    id: "vzd-wardley-arrow",
    markerWidth: "8",
    markerHeight: "8",
    refX: "6",
    refY: "3",
    orient: "auto",
  });
  const markerPath = createSvgEl("path", {
    d: "M0,0 L0,6 L8,3 z",
    class: "vzd-wardley-arrowhead",
  });
  marker.appendChild(markerPath);
  defs.appendChild(marker);
  svg.appendChild(defs);

  // ── Evolution stage bands and labels ──────────────────────────────────
  const stageW = PLOT_W / EVOLUTION_STAGES.length;
  EVOLUTION_STAGES.forEach((stage, i) => {
    const x = PLOT_X + i * stageW;
    // Alternating subtle band
    if (i % 2 === 1) {
      const rect = createSvgEl("rect", {
        x: String(x), y: String(PLOT_Y),
        width: String(stageW), height: String(PLOT_H),
        class: "vzd-wardley-band",
      });
      svg.appendChild(rect);
    }
    // Stage divider
    if (i > 0) {
      const line = createSvgEl("line", {
        x1: String(x), y1: String(PLOT_Y),
        x2: String(x), y2: String(PLOT_Y + PLOT_H),
        class: "vzd-wardley-stage-line",
      });
      svg.appendChild(line);
    }
    // Stage label at the bottom
    const label = createSvgEl("text", {
      x: String(x + stageW / 2),
      y: String(PLOT_Y + PLOT_H + 22),
      class: "vzd-wardley-stage-label",
      "text-anchor": "middle",
    });
    label.textContent = stage;
    svg.appendChild(label);
  });

  // ── Axis lines ─────────────────────────────────────────────────────────
  const xAxis = createSvgEl("line", {
    x1: String(PLOT_X), y1: String(PLOT_Y + PLOT_H),
    x2: String(PLOT_X + PLOT_W), y2: String(PLOT_Y + PLOT_H),
    class: "vzd-wardley-axis",
  });
  const yAxis = createSvgEl("line", {
    x1: String(PLOT_X), y1: String(PLOT_Y),
    x2: String(PLOT_X), y2: String(PLOT_Y + PLOT_H),
    class: "vzd-wardley-axis",
  });
  svg.appendChild(xAxis);
  svg.appendChild(yAxis);

  // Y axis label
  const yLabel = createSvgEl("text", {
    x: String(PLOT_X - 10),
    y: String(PLOT_Y + PLOT_H / 2),
    class: "vzd-wardley-axis-label vzd-wardley-axis-label--y",
    "text-anchor": "middle",
    transform: `rotate(-90, ${PLOT_X - 10}, ${PLOT_Y + PLOT_H / 2})`,
  });
  yLabel.textContent = "Visibility";
  svg.appendChild(yLabel);

  // X axis label
  const xLabel = createSvgEl("text", {
    x: String(PLOT_X + PLOT_W / 2),
    y: String(H - 8),
    class: "vzd-wardley-axis-label",
    "text-anchor": "middle",
  });
  xLabel.textContent = "Evolution →";
  svg.appendChild(xLabel);

  // ── Build component lookup for link drawing ────────────────────────────
  const compMap = new Map<string, WardleyComponent>();
  for (const c of data.components) compMap.set(c.name, c);

  // ── Links ──────────────────────────────────────────────────────────────
  for (const link of data.links) {
    const from = compMap.get(link.from);
    const to   = compMap.get(link.to);
    if (!from || !to) continue;

    const x1 = toSvgX(from.evolution);
    const y1 = toSvgY(from.visibility);
    const x2 = toSvgX(to.evolution);
    const y2 = toSvgY(to.visibility);

    // Shorten line so it ends at the node edge, not the centre
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const ex = (dx / dist) * (NODE_R + 2);
    const ey = (dy / dist) * (NODE_R + 2);

    const line = createSvgEl("line", {
      x1: String(x1 + ex), y1: String(y1 + ey),
      x2: String(x2 - ex), y2: String(y2 - ey),
      class: "vzd-wardley-link",
      "marker-end": "url(#vzd-wardley-arrow)",
    });
    svg.appendChild(line);
  }

  // ── Nodes ──────────────────────────────────────────────────────────────
  for (const comp of data.components) {
    const cx = toSvgX(comp.evolution);
    const cy = toSvgY(comp.visibility);
    const isAnchor = comp.name === data.anchor;

    const circle = createSvgEl("circle", {
      cx: String(cx), cy: String(cy), r: String(NODE_R),
      class: isAnchor ? "vzd-wardley-node vzd-wardley-node--anchor" : "vzd-wardley-node",
    });
    svg.appendChild(circle);

    const { dx, dy, anchor } = labelAnchor(comp.evolution, comp.visibility);
    const text = createSvgEl("text", {
      x: String(cx + dx),
      y: String(cy + dy),
      class: "vzd-wardley-label",
      "text-anchor": anchor,
    });
    text.textContent = comp.name;
    svg.appendChild(text);
  }

  wrap.appendChild(svg);
}
