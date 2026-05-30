import type { WardleyMap, WardleyComponent } from "../types";
import { t } from "../i18n";
import { initCanvas } from "./controls";
import { createSvgEl } from "../shared/svg";
import { WARDLEY_CHAR_W_PX, WARDLEY_LABEL_MIN_GAP_PX, WARDLEY_LABEL_OVERLAP_X_PX } from "../shared/constants";

// Canvas dimensions
const W = 800;
const H = 520;
const PAD = { top: 20, right: 30, bottom: 60, left: 60 };

// Plot area
const PLOT_X = PAD.left;
const PLOT_Y = PAD.top;
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

const evolutionStages = (): string[] => [t("wardley.stage.genesis"), t("wardley.stage.custom"), t("wardley.stage.product"), t("wardley.stage.commodity")];
const NODE_R = 8;

function toSvgX(evolution: number): number {
  return PLOT_X + evolution * PLOT_W;
}

function toSvgY(visibility: number): number {
  // visibility 1 → top, 0 → bottom
  return PLOT_Y + (1 - visibility) * PLOT_H;
}


/**
 * Base anchor direction for a label based on its map quadrant.
 * Right-side nodes get right-aligned text to the left of the node;
 * left-side nodes get left-aligned text to the right.
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

interface LabelSlot {
  /** Final SVG x of the text anchor point. */
  textX: number;
  /** Mutable SVG y of the text anchor point — adjusted by the nudge pass. */
  textY: number;
  anchor: string;
  name: string;
}

/**
 * Run a single-pass vertical nudge over all label slots to reduce overlap.
 *
 * Algorithm:
 *  1. Sort slots by textX then textY.
 *  2. For each consecutive pair that is horizontally close AND vertically
 *     too close, push the lower slot down by the gap deficit.
 *
 * This is O(n²) in the number of horizontally overlapping labels, but for
 * typical Wardley maps (< 30 components) the cost is negligible.
 */
function nudgeLabels(slots: LabelSlot[]): void {
  // Sort by x-band first, then by y so we process top-to-bottom within a band.
  slots.sort((a, b) => a.textX - b.textX || a.textY - b.textY);

  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      const a = slots[i];
      const b = slots[j];

      // Estimate horizontal extents (rough: name length × char width).
      const aW = a.name.length * WARDLEY_CHAR_W_PX;
      const bW = b.name.length * WARDLEY_CHAR_W_PX;
      const aLeft  = a.anchor === "end" ? a.textX - aW : a.textX;
      const aRight = a.anchor === "end" ? a.textX      : a.textX + aW;
      const bLeft  = b.anchor === "end" ? b.textX - bW : b.textX;
      const bRight = b.anchor === "end" ? b.textX      : b.textX + bW;

      // Skip pairs whose text columns don't overlap horizontally.
      if (aRight + WARDLEY_LABEL_OVERLAP_X_PX < bLeft || bRight + WARDLEY_LABEL_OVERLAP_X_PX < aLeft) continue;

      const gap = b.textY - a.textY;
      if (gap < WARDLEY_LABEL_MIN_GAP_PX) {
        b.textY += WARDLEY_LABEL_MIN_GAP_PX - gap;
      }
    }
  }
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
  const stageW = PLOT_W / evolutionStages().length;
  evolutionStages().forEach((stage, i) => {
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
  yLabel.textContent = t("wardley.axis.visibility");
  svg.appendChild(yLabel);

  // X axis label
  const xLabel = createSvgEl("text", {
    x: String(PLOT_X + PLOT_W / 2),
    y: String(H - 8),
    class: "vzd-wardley-axis-label",
    "text-anchor": "middle",
  });
  xLabel.textContent = t("wardley.axis.evolution");
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
  // Compute label positions first so the nudge pass can adjust them before
  // any SVG elements are created.
  const labelSlots: LabelSlot[] = data.components.map(comp => {
    const cx = toSvgX(comp.evolution);
    const cy = toSvgY(comp.visibility);
    const { dx, dy, anchor } = labelAnchor(comp.evolution, comp.visibility);
    return { textX: cx + dx, textY: cy + dy, anchor, name: comp.name };
  });
  nudgeLabels(labelSlots);

  for (let i = 0; i < data.components.length; i++) {
    const comp = data.components[i];
    const cx = toSvgX(comp.evolution);
    const cy = toSvgY(comp.visibility);
    const isAnchor = comp.name === data.anchor;

    const circle = createSvgEl("circle", {
      cx: String(cx), cy: String(cy), r: String(NODE_R),
      class: isAnchor ? "vzd-wardley-node vzd-wardley-node--anchor" : "vzd-wardley-node",
    });
    svg.appendChild(circle);

    const slot = labelSlots[i];
    const text = createSvgEl("text", {
      x: String(slot.textX),
      y: String(slot.textY),
      class: "vzd-wardley-label",
      "text-anchor": slot.anchor,
    });
    text.textContent = comp.name;
    svg.appendChild(text);
  }

  wrap.appendChild(svg);
}
