import type { App, MarkdownPostProcessorContext } from "obsidian";
import type { WardleyMap, WardleyComponent } from "../types";
import { t } from "../i18n";
import { initCanvas } from "./controls";
import { parseTitle, writeCanvasTitle } from "../shared/title-edit";
import { isEditModeActive } from "../shared/editor";
import { createSvgEl } from "../shared/svg";
import { onDisconnected } from "../shared/lifecycle";
import { wireRenameInputKeys, createBlurGuard } from "./inline-edit";
import { WARDLEY_CHAR_W_PX, WARDLEY_LABEL_MIN_GAP_PX, WARDLEY_LABEL_OVERLAP_X_PX, WARDLEY_LABEL_MAX_NUDGE_PX } from "../shared/constants";
import { writeWardleyComponent, addWardleyComponent, renameWardleyComponent, removeWardleyLink, writeWardleyEvolve } from "../shared/wardley-edit";

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

/**
 * Positions are per-label right edges (`parseWardleyMap` requires each value
 * strictly < 1), so used verbatim the last stage would stop short of
 * evolution = 1, leaving a permanently unstyled sliver past it. The last
 * edge is therefore always the canvas boundary (1), not the user's value.
 */
function stageEdgesFromPositions(positions: number[]): number[] {
  if (positions.length === 0) return [0, 1];
  return [0, ...positions.slice(0, -1), 1];
}

function toSvgX(evolution: number): number {
  return PLOT_X + evolution * PLOT_W;
}

function toSvgY(visibility: number): number {
  return PLOT_Y + (1 - visibility) * PLOT_H;
}

function svgToData(svgX: number, svgY: number): { visibility: number; evolution: number } {
  return {
    evolution:  Math.max(0, Math.min(1, (svgX - PLOT_X) / PLOT_W)),
    visibility: Math.max(0, Math.min(1, 1 - (svgY - PLOT_Y) / PLOT_H)),
  };
}

/** Convert client (screen) coordinates to the SVG's own coordinate space. */
function clientToSvg(svg: SVGSVGElement, clientX: number, clientY: number): { x: number; y: number } {
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
  componentIndex: number;
  textX: number;
  textY: number;
  /** Natural (pre-nudge) y — used to detect displacement and draw leader lines. */
  naturalY: number;
  anchor: string;
  name: string;
}

function nudgeLabels(slots: LabelSlot[]): void {
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

// ── Shared types for interactive behaviors ─────────────────────────────────

type NodeRef = { circle: SVGCircleElement; textEl: SVGTextElement; comp: WardleyComponent };
/** The draggable "to-be" marker of an evolution arrow. `fromX` is the current
 *  node's svg-x (the arrow tail); `y` is the fixed visibility row. */
type EvolveRef = { circle: SVGCircleElement; line: SVGLineElement; comp: WardleyComponent; fromX: number; y: number };
type DragState = { ref: NodeRef };
type LinkDrawState = {
  sourceRef: NodeRef;
  ghostLine: SVGLineElement;
  ghostDot: SVGCircleElement;
  hasMoved: boolean;
};
type ActiveRename = { foreignObject: SVGForeignObjectElement; input: HTMLInputElement };

/**
 * Mutable cross-cutting state shared across the three interaction modes.
 * All three attach* functions receive this object by reference so they see
 * each other's state changes (e.g. drag blocks rename; rename hides the
 * add-handle; link-draw prevents rename activation).
 */
type WardleyIxState = {
  drag: DragState | null;
  activeRename: ActiveRename | null;
  linkDraw: LinkDrawState | null;
  handleTarget: NodeRef | null;
  hideHandleTimer: ReturnType<typeof setTimeout> | null;
  addHandleG: SVGGElement;
};

// ── Static rendering helpers ───────────────────────────────────────────────

function renderStageBands(svg: SVGSVGElement, data: WardleyMap): void {
  const stages = data.stages && data.stages.length > 0 ? data.stages : evolutionStages();
  const hasPositionedStages = !!data.stagePositions && data.stagePositions.length === stages.length;

  if (hasPositionedStages) {
    const stagePositions = data.stagePositions!;
    const edges = stageEdgesFromPositions(stagePositions);
    for (let i = 0; i < stages.length; i++) {
      const left = edges[i], right = edges[i + 1];
      if (!Number.isFinite(left) || !Number.isFinite(right) || right < left) continue;
      if (i % 2 === 1) {
        const leftX = PLOT_X + left * PLOT_W;
        const rightX = PLOT_X + right * PLOT_W;
        svg.appendChild(createSvgEl("rect", {
          x: String(leftX), y: String(PLOT_Y), width: String(rightX - leftX), height: String(PLOT_H),
          class: "vzd-wardley-band",
        }));
      }
    }
    stagePositions.forEach((pos, i) => {
      const left = edges[i], right = edges[i + 1];
      if (!Number.isFinite(left) || !Number.isFinite(right) || right < left) return;
      const x = PLOT_X + ((left + right) / 2) * PLOT_W;
      // The last position no longer marks a real edge (the last stage's
      // right edge is always the canvas boundary) — skip its divider line.
      if (pos > 0 && pos < 1 && i < stagePositions.length - 1) {
        svg.appendChild(createSvgEl("line", {
          x1: String(PLOT_X + pos * PLOT_W), y1: String(PLOT_Y),
          x2: String(PLOT_X + pos * PLOT_W), y2: String(PLOT_Y + PLOT_H),
          class: "vzd-wardley-stage-line",
        }));
      }
      const label = createSvgEl("text", {
        x: String(x), y: String(PLOT_Y + PLOT_H + 22),
        class: "vzd-wardley-stage-label", "text-anchor": "middle",
      });
      label.textContent = stages[i];
      svg.appendChild(label);
    });
  } else {
    const stageW = PLOT_W / stages.length;
    stages.forEach((stage, i) => {
      const x = PLOT_X + i * stageW;
      if (i % 2 === 1) {
        svg.appendChild(createSvgEl("rect", {
          x: String(x), y: String(PLOT_Y), width: String(stageW), height: String(PLOT_H),
          class: "vzd-wardley-band",
        }));
      }
      if (i > 0) {
        svg.appendChild(createSvgEl("line", {
          x1: String(x), y1: String(PLOT_Y), x2: String(x), y2: String(PLOT_Y + PLOT_H),
          class: "vzd-wardley-stage-line",
        }));
      }
      const label = createSvgEl("text", {
        x: String(x + stageW / 2), y: String(PLOT_Y + PLOT_H + 22),
        class: "vzd-wardley-stage-label", "text-anchor": "middle",
      });
      label.textContent = stage;
      svg.appendChild(label);
    });
  }
}

function renderAxes(svg: SVGSVGElement): void {
  svg.appendChild(createSvgEl("line", {
    x1: String(PLOT_X), y1: String(PLOT_Y + PLOT_H),
    x2: String(PLOT_X + PLOT_W), y2: String(PLOT_Y + PLOT_H), class: "vzd-wardley-axis",
  }));
  svg.appendChild(createSvgEl("line", {
    x1: String(PLOT_X), y1: String(PLOT_Y),
    x2: String(PLOT_X), y2: String(PLOT_Y + PLOT_H), class: "vzd-wardley-axis",
  }));
  const yLabel = createSvgEl("text", {
    x: String(PLOT_X - 10), y: String(PLOT_Y + PLOT_H / 2),
    class: "vzd-wardley-axis-label vzd-wardley-axis-label--y", "text-anchor": "middle",
    transform: `rotate(-90, ${PLOT_X - 10}, ${PLOT_Y + PLOT_H / 2})`,
  });
  yLabel.textContent = t("wardley.axis.visibility");
  svg.appendChild(yLabel);
  const xLabel = createSvgEl("text", {
    x: String(PLOT_X + PLOT_W / 2), y: String(H - 8),
    class: "vzd-wardley-axis-label", "text-anchor": "middle",
  });
  xLabel.textContent = t("wardley.axis.evolution");
  svg.appendChild(xLabel);
}

function renderLinks(
  svg: SVGSVGElement,
  data: WardleyMap,
  app: App | undefined,
  mppCtx: MarkdownPostProcessorContext | undefined,
  wrap: HTMLElement,
): void {
  const compMap = new Map<string, WardleyComponent>();
  for (const c of data.components) compMap.set(c.name, c);

  for (const link of data.links) {
    const from = compMap.get(link.from), to = compMap.get(link.to);
    if (!from || !to) continue;
    const x1 = toSvgX(from.evolution), y1 = toSvgY(from.visibility);
    const x2 = toSvgX(to.evolution),   y2 = toSvgY(to.visibility);
    const dx = x2 - x1, dy = y2 - y1;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const ex = (dx / dist) * (NODE_R + 2), ey = (dy / dist) * (NODE_R + 2);
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;

    const linkG = createSvgEl("g", { class: "vzd-wardley-link-g" });
    linkG.appendChild(createSvgEl("line", {
      x1: String(x1 + ex), y1: String(y1 + ey),
      x2: String(x2 - ex), y2: String(y2 - ey),
      class: "vzd-wardley-link", "marker-end": "url(#vzd-wardley-arrow)",
    }));

    if (app && mppCtx && isEditModeActive(app)) {
      linkG.appendChild(createSvgEl("line", {
        x1: String(x1 + ex), y1: String(y1 + ey),
        x2: String(x2 - ex), y2: String(y2 - ey),
        class: "vzd-wardley-link-hit",
      }));

      const deleteBtn = createSvgEl("g", { class: "vzd-wardley-unlink-btn" });
      deleteBtn.appendChild(createSvgEl("circle", {
        cx: String(mx), cy: String(my), r: "8", class: "vzd-wardley-unlink-circle",
      }));
      const xText = createSvgEl("text", {
        x: String(mx), y: String(my),
        class: "vzd-wardley-unlink-icon",
        "text-anchor": "middle", "dominant-baseline": "central",
      });
      xText.textContent = "×";
      deleteBtn.appendChild(xText);
      deleteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        removeWardleyLink(app, mppCtx, wrap, link.from, link.to);
      });
      linkG.appendChild(deleteBtn);
    }

    svg.appendChild(linkG);
  }
}

/** Pipeline box height (px) and sub-component square half-size (px). */
const PIPELINE_BOX_H = 14;
const PIPELINE_ITEM_R = 5;

/**
 * Draws pipelines: a component rendered as a box spanning an evolution range
 * at its own visibility, holding sub-components as small squares along the
 * box's centre line — the Wardley Map notion of a component that is itself a
 * set of choices at differing evolutionary maturities.
 */
function renderPipelines(svg: SVGSVGElement, data: WardleyMap): void {
  const compMap = new Map<string, WardleyComponent>();
  for (const c of data.components) compMap.set(c.name, c);

  for (const pipe of data.pipelines) {
    const comp = compMap.get(pipe.component);
    if (!comp) continue;
    const y = toSvgY(comp.visibility);
    const xLeft = toSvgX(pipe.x1);
    const xRight = toSvgX(pipe.x2);

    const g = createSvgEl("g", { class: "vzd-wardley-pipeline-g" });

    // The enclosing box (rounded rectangle spanning the evolution range).
    g.appendChild(createSvgEl("rect", {
      x: String(xLeft), y: String(y - PIPELINE_BOX_H / 2),
      width: String(xRight - xLeft), height: String(PIPELINE_BOX_H),
      rx: String(PIPELINE_BOX_H / 2),
      class: "vzd-wardley-pipeline-box",
    }));

    // Sub-components as small squares on the box's centre line, with labels below.
    for (const item of pipe.items) {
      const ix = toSvgX(item.evolution);
      g.appendChild(createSvgEl("rect", {
        x: String(ix - PIPELINE_ITEM_R), y: String(y - PIPELINE_ITEM_R),
        width: String(PIPELINE_ITEM_R * 2), height: String(PIPELINE_ITEM_R * 2),
        class: "vzd-wardley-pipeline-node",
      }));
      const label = createSvgEl("text", {
        x: String(ix), y: String(y + PIPELINE_BOX_H / 2 + 12),
        class: "vzd-wardley-pipeline-label", "text-anchor": "middle",
      });
      label.textContent = item.name;
      g.appendChild(label);
    }

    svg.appendChild(g);
  }
}

/**
 * Draws evolution (movement) arrows: a dashed red line from a component's
 * current position to its future `evolveTo` position at the same visibility,
 * ending in a hollow red "to-be" marker — the core Wardley Map notion of a
 * component commoditising over time.
 */
function renderEvolutions(svg: SVGSVGElement, data: WardleyMap): EvolveRef[] {
  const refs: EvolveRef[] = [];
  for (const comp of data.components) {
    if (comp.evolveTo === undefined) continue;
    const y = toSvgY(comp.visibility);
    const x1 = toSvgX(comp.evolution);
    const x2 = toSvgX(comp.evolveTo);
    const dir = Math.sign(x2 - x1) || 1;

    const g = createSvgEl("g", { class: "vzd-wardley-evolve-g" });
    const line = createSvgEl("line", {
      x1: String(x1 + dir * (NODE_R + 2)), y1: String(y),
      x2: String(x2 - dir * (NODE_R + 2)), y2: String(y),
      class: "vzd-wardley-evolve-line", "marker-end": "url(#vzd-wardley-evolve-arrow)",
    }) as SVGLineElement;
    g.appendChild(line);
    const circle = createSvgEl("circle", {
      cx: String(x2), cy: String(y), r: String(NODE_R),
      class: "vzd-wardley-evolve-node",
    }) as SVGCircleElement;
    g.appendChild(circle);
    svg.appendChild(g);

    refs.push({ circle, line, comp, fromX: x1, y });
  }
  return refs;
}

function renderNodes(svg: SVGSVGElement, data: WardleyMap): NodeRef[] {
  const labelSlots: LabelSlot[] = data.components.map((comp, componentIndex) => {
    const cx = toSvgX(comp.evolution), cy = toSvgY(comp.visibility);
    const { dx, dy, anchor } = labelAnchor(comp.evolution, comp.visibility);
    const textY = cy + dy;
    return { componentIndex, textX: cx + dx, textY, naturalY: textY, anchor, name: comp.name };
  });
  nudgeLabels(labelSlots);
  const slotByIndex = new Map<number, LabelSlot>();
  for (const slot of labelSlots) slotByIndex.set(slot.componentIndex, slot);

  const nodeRefs: NodeRef[] = [];

  for (let i = 0; i < data.components.length; i++) {
    const comp = data.components[i];
    const cx = toSvgX(comp.evolution), cy = toSvgY(comp.visibility);
    const isAnchor = comp.name === data.anchor;

    const circle = createSvgEl("circle", {
      cx: String(cx), cy: String(cy), r: String(NODE_R),
      class: isAnchor ? "vzd-wardley-node vzd-wardley-node--anchor" : "vzd-wardley-node",
    }) as SVGCircleElement;
    svg.appendChild(circle);

    const slot = slotByIndex.get(i);
    if (!slot) continue;

    if (slot.textY - slot.naturalY > 6) {
      const leaderX = cx + (slot.anchor === "end" ? -(NODE_R + 2) : NODE_R + 2);
      svg.appendChild(createSvgEl("line", {
        x1: String(leaderX), y1: String(cy),
        x2: String(slot.textX), y2: String(slot.textY - 3),
        class: "vzd-wardley-leader",
      }));
    }

    const textEl = createSvgEl("text", {
      x: String(slot.textX), y: String(slot.textY),
      class: "vzd-wardley-label", "text-anchor": slot.anchor,
    }) as SVGTextElement;
    textEl.textContent = comp.name;
    svg.appendChild(textEl);

    nodeRefs.push({ circle, textEl, comp });
  }

  return nodeRefs;
}

function buildAddHandle(svg: SVGSVGElement): SVGGElement {
  const addHandleG = createSvgEl("g", { class: "vzd-wardley-add-handle-g" }) as SVGGElement;
  addHandleG.style.display = "none";
  addHandleG.appendChild(createSvgEl("circle", { cx: "0", cy: "0", r: "14", class: "vzd-wardley-add-handle-hit" }));
  addHandleG.appendChild(createSvgEl("circle", { cx: "0", cy: "0", r: "7", class: "vzd-wardley-add-handle" }));
  const plus = createSvgEl("text", {
    x: "0", y: "0.5", class: "vzd-wardley-add-handle-icon",
    "text-anchor": "middle", "dominant-baseline": "middle",
  }) as SVGTextElement;
  plus.textContent = "+";
  addHandleG.appendChild(plus);
  svg.appendChild(addHandleG);
  return addHandleG;
}

// ── Interaction: drag to reposition ───────────────────────────────────────

function attachDragBehavior(
  svg: SVGSVGElement,
  nodeRefs: NodeRef[],
  ix: WardleyIxState,
  data: WardleyMap,
  app: App,
  mppCtx: MarkdownPostProcessorContext,
  wrap: HTMLElement,
): void {
  const doc = svg.ownerDocument;
  // Tooltip — only used by drag, so owned here rather than in WardleyIxState
  const tooltipG = createSvgEl("g", { class: "vzd-wardley-drag-tooltip" }) as SVGGElement;
  tooltipG.style.display = "none";
  const tooltipBg = createSvgEl("rect", { rx: "4", class: "vzd-wardley-drag-tooltip-bg" }) as SVGRectElement;
  const tooltipTxt = createSvgEl("text", {
    class: "vzd-wardley-drag-tooltip-text", "dominant-baseline": "middle",
  }) as SVGTextElement;
  tooltipG.appendChild(tooltipBg);
  tooltipG.appendChild(tooltipTxt);
  svg.appendChild(tooltipG);

  const updateTooltip = (cx: number, cy: number, vis: number, evo: number): void => {
    const text = `vis ${vis.toFixed(2)}  evo ${evo.toFixed(2)}`;
    tooltipTxt.textContent = text;
    const tipX = cx + PLOT_X * 0.1 < W - 120 ? cx + NODE_R + 6 : cx - NODE_R - 6;
    const tipAnchor = cx + NODE_R + 6 < W - 120 ? "start" : "end";
    tooltipTxt.setAttribute("x", String(tipX));
    tooltipTxt.setAttribute("y", String(cy - NODE_R - 8));
    tooltipTxt.setAttribute("text-anchor", tipAnchor);
    const charW = 7, pad = 4;
    const bw = text.length * charW + pad * 2;
    const bx = tipAnchor === "start" ? tipX - pad : tipX - bw + pad;
    tooltipBg.setAttribute("x", String(bx));
    tooltipBg.setAttribute("y", String(cy - NODE_R - 22));
    tooltipBg.setAttribute("width", String(bw));
    tooltipBg.setAttribute("height", "16");
    tooltipG.style.display = "";
  };

  const moveDot = (ref: NodeRef, clientX: number, clientY: number): void => {
    const { x: svgX, y: svgY } = clientToSvg(svg, clientX, clientY);
    const cx = Math.max(PLOT_X, Math.min(PLOT_X + PLOT_W, svgX));
    const cy = Math.max(PLOT_Y, Math.min(PLOT_Y + PLOT_H, svgY));
    const { visibility, evolution } = svgToData(cx, cy);

    ref.circle.setAttribute("cx", String(cx));
    ref.circle.setAttribute("cy", String(cy));

    const { dx, dy, anchor } = labelAnchor(evolution, visibility);
    ref.textEl.setAttribute("x", String(cx + dx));
    ref.textEl.setAttribute("y", String(cy + dy));
    ref.textEl.setAttribute("text-anchor", anchor);

    updateTooltip(cx, cy, visibility, evolution);
  };

  const endDrag = (): void => {
    if (!ix.drag) return;
    const { ref } = ix.drag;
    ix.drag = null;

    tooltipG.style.display = "none";
    ref.circle.classList.remove("vzd-wardley-node--dragging");
    svg.classList.remove("vzd-wardley-svg--dragging");

    const cx = parseFloat(ref.circle.getAttribute("cx") ?? "0");
    const cy = parseFloat(ref.circle.getAttribute("cy") ?? "0");
    const { visibility, evolution } = svgToData(cx, cy);

    writeWardleyComponent(app, mppCtx, wrap, ref.comp.name, visibility, evolution);

    doc.removeEventListener("mousemove", onMouseMove);
    doc.removeEventListener("mouseup", onMouseUp);
  };

  const onMouseMove = (e: MouseEvent): void => { if (ix.drag) moveDot(ix.drag.ref, e.clientX, e.clientY); };
  const onMouseUp = (): void => endDrag();

  // If the canvas is torn down mid-drag (e.g. the note is edited elsewhere,
  // triggering a re-render), endDrag()'s own `!ix.drag` guard would otherwise
  // never run — leaving these document-level listeners attached forever and
  // letting a later mouseup write a stale/detached position. Remove them and
  // drop the drag state directly instead of routing through endDrag().
  onDisconnected(wrap, () => {
    doc.removeEventListener("mousemove", onMouseMove);
    doc.removeEventListener("mouseup", onMouseUp);
    ix.drag = null;
  });

  // Touch listeners are registered once on svg (not per-node) to avoid duplicate handlers
  svg.addEventListener("touchmove", (e) => {
    if (!ix.drag) return;
    e.preventDefault();
    moveDot(ix.drag.ref, e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: false });
  svg.addEventListener("touchend", () => endDrag());

  for (const ref of nodeRefs) {
    if (!data.explicitComponents.has(ref.comp.name)) continue;

    ref.circle.classList.add("vzd-wardley-node--draggable");

    const startDrag = (clientX: number, clientY: number): void => {
      if (ix.activeRename) return;
      ix.drag = { ref };
      ref.circle.classList.add("vzd-wardley-node--dragging");
      svg.classList.add("vzd-wardley-svg--dragging");
      moveDot(ref, clientX, clientY);
      doc.addEventListener("mousemove", onMouseMove);
      doc.addEventListener("mouseup", onMouseUp);
    };

    ref.circle.addEventListener("mousedown", (e) => { e.preventDefault(); e.stopPropagation(); startDrag(e.clientX, e.clientY); });
    ref.circle.addEventListener("touchstart", (e) => { e.preventDefault(); startDrag(e.touches[0].clientX, e.touches[0].clientY); }, { passive: false });
  }
}

// ── Interaction: drag the evolution "to-be" marker (horizontal only) ───────

function attachEvolveDragBehavior(
  svg: SVGSVGElement,
  evolveRefs: EvolveRef[],
  ix: WardleyIxState,
  app: App,
  mppCtx: MarkdownPostProcessorContext,
  wrap: HTMLElement,
): void {
  const doc = svg.ownerDocument;
  let active: EvolveRef | null = null;

  const moveTo = (ref: EvolveRef, clientX: number): void => {
    const { x } = clientToSvg(svg, clientX, 0);
    const cx = Math.max(PLOT_X, Math.min(PLOT_X + PLOT_W, x));
    const dir = Math.sign(cx - ref.fromX) || 1;
    ref.circle.setAttribute("cx", String(cx));
    // Re-trim both ends so the arrow flips cleanly if dragged past the source.
    ref.line.setAttribute("x1", String(ref.fromX + dir * (NODE_R + 2)));
    ref.line.setAttribute("x2", String(cx - dir * (NODE_R + 2)));
  };

  const onMove = (e: MouseEvent): void => { if (active) moveTo(active, e.clientX); };
  const onUp = (): void => {
    if (!active) return;
    const ref = active;
    active = null;
    ref.circle.classList.remove("vzd-wardley-evolve-node--dragging");
    svg.classList.remove("vzd-wardley-svg--dragging");
    doc.removeEventListener("mousemove", onMove);
    doc.removeEventListener("mouseup", onUp);
    const cx = parseFloat(ref.circle.getAttribute("cx") ?? "0");
    const evolveTo = Math.max(0, Math.min(1, (cx - PLOT_X) / PLOT_W));
    writeWardleyEvolve(app, mppCtx, wrap, ref.comp.name, evolveTo);
  };

  onDisconnected(wrap, () => {
    doc.removeEventListener("mousemove", onMove);
    doc.removeEventListener("mouseup", onUp);
    active = null;
  });

  for (const ref of evolveRefs) {
    ref.circle.classList.add("vzd-wardley-evolve-node--draggable");
    const start = (clientX: number): void => {
      if (ix.activeRename || ix.drag || ix.linkDraw) return;
      active = ref;
      ref.circle.classList.add("vzd-wardley-evolve-node--dragging");
      svg.classList.add("vzd-wardley-svg--dragging");
      moveTo(ref, clientX);
      doc.addEventListener("mousemove", onMove);
      doc.addEventListener("mouseup", onUp);
    };
    ref.circle.addEventListener("mousedown", (e) => { e.preventDefault(); e.stopPropagation(); start(e.clientX); });
    ref.circle.addEventListener("touchstart", (e) => { e.preventDefault(); start(e.touches[0].clientX); }, { passive: false });
    ref.circle.addEventListener("touchmove", (e) => { if (active) { e.preventDefault(); moveTo(active, e.touches[0].clientX); } }, { passive: false });
    ref.circle.addEventListener("touchend", () => onUp());
  }
}

// ── Interaction: + handle and link-draw gesture ────────────────────────────

function attachLinkDrawBehavior(
  svg: SVGSVGElement,
  nodeRefs: NodeRef[],
  ix: WardleyIxState,
  data: WardleyMap,
  app: App,
  mppCtx: MarkdownPostProcessorContext,
  wrap: HTMLElement,
): void {
  const doc = svg.ownerDocument;
  const { addHandleG } = ix;

  const isInsideHandle = (next: EventTarget | null): boolean =>
    next instanceof Node && addHandleG.contains(next);

  const positionHandle = (ref: NodeRef): void => {
    const cx = parseFloat(ref.circle.getAttribute("cx") ?? "0");
    const cy = parseFloat(ref.circle.getAttribute("cy") ?? "0");
    addHandleG.setAttribute("transform", `translate(${cx + NODE_R + 12}, ${cy})`);
    addHandleG.style.display = "";
    ix.handleTarget = ref;
  };

  const scheduleHideHandle = (): void => {
    if (ix.hideHandleTimer) clearTimeout(ix.hideHandleTimer);
    ix.hideHandleTimer = setTimeout(() => {
      if (!ix.linkDraw) { addHandleG.style.display = "none"; ix.handleTarget = null; }
    }, 280);
  };

  const cancelHideHandle = (): void => {
    if (ix.hideHandleTimer) { clearTimeout(ix.hideHandleTimer); ix.hideHandleTimer = null; }
  };

  for (const ref of nodeRefs) {
    if (!data.explicitComponents.has(ref.comp.name)) continue;
    ref.circle.addEventListener("mouseenter", () => {
      if (ix.drag || ix.activeRename) return;
      cancelHideHandle();
      positionHandle(ref);
    });
    ref.circle.addEventListener("mouseleave", (e) => {
      if (isInsideHandle(e.relatedTarget)) return;
      scheduleHideHandle();
    });
  }

  addHandleG.addEventListener("mouseenter", () => cancelHideHandle());
  addHandleG.addEventListener("mouseleave", (e) => {
    if (ix.handleTarget && e.relatedTarget === ix.handleTarget.circle) return;
    scheduleHideHandle();
  });

  const onLinkMove = (e: MouseEvent): void => {
    if (!ix.linkDraw) return;
    const { x, y } = clientToSvg(svg, e.clientX, e.clientY);
    const cx = Math.max(PLOT_X, Math.min(PLOT_X + PLOT_W, x));
    const cy = Math.max(PLOT_Y, Math.min(PLOT_Y + PLOT_H, y));
    ix.linkDraw.ghostLine.setAttribute("x2", String(cx));
    ix.linkDraw.ghostLine.setAttribute("y2", String(cy));
    ix.linkDraw.ghostDot.setAttribute("cx", String(cx));
    ix.linkDraw.ghostDot.setAttribute("cy", String(cy));
    if (!ix.linkDraw.hasMoved) {
      const srcCx = parseFloat(ix.linkDraw.sourceRef.circle.getAttribute("cx") ?? "0");
      const srcCy = parseFloat(ix.linkDraw.sourceRef.circle.getAttribute("cy") ?? "0");
      if (Math.hypot(cx - srcCx, cy - srcCy) > NODE_R * 2) ix.linkDraw.hasMoved = true;
    }
  };

  const endLinkDraw = (withLink: boolean, cancel = false): void => {
    if (!ix.linkDraw) return;
    const { sourceRef, ghostLine, ghostDot, hasMoved } = ix.linkDraw;
    ix.linkDraw = null;
    ghostLine.remove();
    ghostDot.remove();
    addHandleG.style.display = "none";
    svg.classList.remove("vzd-wardley-svg--drawing");
    doc.removeEventListener("mousemove", onLinkMove);
    doc.removeEventListener("mouseup", onLinkUp);
    doc.removeEventListener("keydown", onLinkKey);
    if (cancel || !hasMoved) return; // Escape (or a non-drag) adds nothing
    const cx = parseFloat(ghostDot.getAttribute("cx") ?? "0");
    const cy = parseFloat(ghostDot.getAttribute("cy") ?? "0");
    const { visibility, evolution } = svgToData(cx, cy);
    addWardleyComponent(app, mppCtx, wrap, sourceRef.comp.name, "New Component", visibility, evolution, withLink);
  };

  // Plain release adds the component + a link (the natural result of dragging a
  // link out); hold Shift to add the component without a link; Escape cancels.
  const onLinkUp = (e: MouseEvent): void => endLinkDraw(!e.shiftKey);
  const onLinkKey = (e: KeyboardEvent): void => { if (e.key === "Escape") endLinkDraw(false, true); };

  // Same rationale as attachDragBehavior: don't rely on endLinkDraw's own
  // `!ix.linkDraw` guard to clean up, since nulling the state first would
  // make it skip removeEventListener and leak these document listeners.
  onDisconnected(wrap, () => {
    doc.removeEventListener("mousemove", onLinkMove);
    doc.removeEventListener("mouseup", onLinkUp);
    doc.removeEventListener("keydown", onLinkKey);
    ix.linkDraw = null;
    if (ix.hideHandleTimer) { clearTimeout(ix.hideHandleTimer); ix.hideHandleTimer = null; }
  });

  addHandleG.addEventListener("mousedown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (ix.activeRename || !ix.handleTarget) return;
    const sourceRef = ix.handleTarget;
    const srcCx = parseFloat(sourceRef.circle.getAttribute("cx") ?? "0");
    const srcCy = parseFloat(sourceRef.circle.getAttribute("cy") ?? "0");

    const ghostLine = createSvgEl("line", {
      x1: String(srcCx), y1: String(srcCy), x2: String(srcCx), y2: String(srcCy),
      class: "vzd-wardley-link-draft",
    }) as SVGLineElement;
    svg.insertBefore(ghostLine, addHandleG);

    const ghostDot = createSvgEl("circle", {
      cx: String(srcCx), cy: String(srcCy), r: String(NODE_R),
      class: "vzd-wardley-node-draft",
    }) as SVGCircleElement;
    svg.insertBefore(ghostDot, addHandleG);

    ix.linkDraw = { sourceRef, ghostLine, ghostDot, hasMoved: false };
    addHandleG.style.display = "none";
    svg.classList.add("vzd-wardley-svg--drawing");
    doc.addEventListener("mousemove", onLinkMove);
    doc.addEventListener("mouseup", onLinkUp);
    doc.addEventListener("keydown", onLinkKey);
  });
}

// ── Interaction: double-click to rename ───────────────────────────────────

function attachRenameBehavior(
  svg: SVGSVGElement,
  nodeRefs: NodeRef[],
  ix: WardleyIxState,
  data: WardleyMap,
  app: App,
  mppCtx: MarkdownPostProcessorContext,
  wrap: HTMLElement,
): void {
  const closeRename = (): void => {
    if (!ix.activeRename) return;
    ix.activeRename.foreignObject.remove();
    ix.activeRename = null;
  };

  const activateRename = (ref: NodeRef): void => {
    if (ix.drag || ix.linkDraw) return;
    closeRename();
    ix.addHandleG.style.display = "none";
    ix.handleTarget = null;

    const textRect = ref.textEl.getBoundingClientRect();
    const svgRect = svg.getBoundingClientRect();

    const labelX = parseFloat(ref.textEl.getAttribute("x") ?? "0");
    const labelY = parseFloat(ref.textEl.getAttribute("y") ?? "0");
    const anchor = ref.textEl.getAttribute("text-anchor") ?? "start";

    const measuredW = svgRect.width > 0 ? textRect.width * (W / svgRect.width) : 0;
    const fallbackW = Math.max(100, ref.comp.name.length * 7 + 24);
    const boxW = Math.max(100, Number.isFinite(measuredW) && measuredW > 0 ? measuredW + 24 : fallbackW);
    const boxH = 24;

    let boxX = anchor === "end" ? labelX - boxW + 6 : labelX - 6;
    let boxY = labelY - 17;
    boxX = Math.max(0, Math.min(W - boxW, boxX));
    boxY = Math.max(0, Math.min(H - boxH, boxY));

    const foreignObject = createSvgEl("foreignObject", {
      x: String(boxX), y: String(boxY), width: String(boxW), height: String(boxH),
      class: "vzd-wardley-rename-fo",
    }) as SVGForeignObjectElement;

    const host = svg.ownerDocument.createElement("div");
    host.className = "vzd-wardley-rename-host";

    const input = svg.ownerDocument.createElement("input");
    input.type = "text";
    input.value = ref.comp.name;
    input.className = "vzd-rename-input vzd-wardley-rename-input";

    host.appendChild(input);
    foreignObject.appendChild(host);
    svg.appendChild(foreignObject);
    ix.activeRename = { foreignObject, input };

    input.focus();
    input.select();

    // Same CM6/Live Preview focus-steal guard as activateInlineEdit — this
    // input is mounted the same way (SVG foreignObject overlay, .focus()
    // called right after insertion).
    const blurGuard = createBlurGuard();
    wireRenameInputKeys(input, (commit) => {
      blurGuard.dispose();
      closeRename();
      const newName = input.value.trim();
      if (commit && newName && newName !== ref.comp.name) {
        renameWardleyComponent(app, mppCtx, wrap, ref.comp.name, newName);
      }
    }, { stopPropagation: true, ignoreBlur: blurGuard.ignoreBlur });
  };

  for (const ref of nodeRefs) {
    if (!data.explicitComponents.has(ref.comp.name)) continue;
    ref.textEl.addEventListener("dblclick", (e) => { e.stopPropagation(); activateRename(ref); });
    ref.circle.addEventListener("dblclick", (e) => { e.stopPropagation(); activateRename(ref); });
  }
}

// ── Public entry point ─────────────────────────────────────────────────────

export function renderWardleyMap(
  data: WardleyMap,
  container: HTMLElement,
  app?: App,
  ctx?: MarkdownPostProcessorContext,
  source?: string,
): void {
  const isEditMode = !!(app && ctx && isEditModeActive(app));
  const defaultTitle = "Wardley Map";
  const title = source !== undefined ? parseTitle(source, defaultTitle) : defaultTitle;
  const onTitleEdit = (isEditMode && source !== undefined)
    ? (newTitle: string) => writeCanvasTitle(app!, ctx!, container, newTitle, defaultTitle)
    : undefined;
  initCanvas(container, "wardley", title, undefined, source, onTitleEdit, app, ctx);

  const wrap = container.createEl("div", { cls: "vzd-wardley-wrap" });

  const svg = createSvgEl("svg", {
    viewBox: `0 0 ${W} ${H}`,
    class: "vzd-wardley-svg",
  }) as SVGSVGElement;

  // Arrow marker definition
  const defs = createSvgEl("defs");
  const marker = createSvgEl("marker", {
    id: "vzd-wardley-arrow", markerWidth: "8", markerHeight: "8",
    refX: "6", refY: "3", orient: "auto",
  });
  marker.appendChild(createSvgEl("path", { d: "M0,0 L0,6 L8,3 z", class: "vzd-wardley-arrowhead" }));
  defs.appendChild(marker);

  // Red arrowhead for evolution (movement) arrows.
  const evolveMarker = createSvgEl("marker", {
    id: "vzd-wardley-evolve-arrow", markerWidth: "8", markerHeight: "8",
    refX: "6", refY: "3", orient: "auto",
  });
  evolveMarker.appendChild(createSvgEl("path", { d: "M0,0 L0,6 L8,3 z", class: "vzd-wardley-evolve-arrowhead" }));
  defs.appendChild(evolveMarker);
  svg.appendChild(defs);

  renderStageBands(svg, data);
  renderAxes(svg);
  renderLinks(svg, data, app, ctx, wrap);
  renderPipelines(svg, data);
  const evolveRefs = renderEvolutions(svg, data);
  const nodeRefs = renderNodes(svg, data);

  wrap.appendChild(svg);

  if (isEditMode) {
    const ix: WardleyIxState = {
      drag: null,
      activeRename: null,
      linkDraw: null,
      handleTarget: null,
      hideHandleTimer: null,
      addHandleG: buildAddHandle(svg),
    };
    attachDragBehavior(svg, nodeRefs, ix, data, app!, ctx!, wrap);
    attachLinkDrawBehavior(svg, nodeRefs, ix, data, app!, ctx!, wrap);
    attachRenameBehavior(svg, nodeRefs, ix, data, app!, ctx!, wrap);
    attachEvolveDragBehavior(svg, evolveRefs, ix, app!, ctx!, wrap);
  }
}
