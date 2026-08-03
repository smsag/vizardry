import type { App, MarkdownPostProcessorContext } from "obsidian";
import type { WardleyMap, WardleyComponent } from "../types";
import type { RenderContext } from "./render-context";
import { t } from "../i18n";
import { initCanvas, renderCanvasWarnings } from "./controls";
import { parseTitle, writeCanvasTitle } from "../shared/title-edit";
import { isEditModeActive } from "../shared/editor";
import { createSvgEl } from "../shared/svg";
import { removeWardleyLink } from "../shared/wardley-edit";
import {
  W, H, PLOT_X, PLOT_Y, PLOT_W, PLOT_H, NODE_R,
  toSvgX, toSvgY, labelAnchor, nudgeLabels, stageEdgesFromPositions, evolveLineEndpoints,
  type LabelSlot, type NodeRef, type EvolveRef,
} from "./wardley-geometry";
import {
  attachDragBehavior, attachEvolveDragBehavior, attachLinkDrawBehavior, attachRenameBehavior,
  type WardleyIxState,
} from "./wardley-interactions";

const evolutionStages = (): string[] => [t("wardley.stage.genesis"), t("wardley.stage.custom"), t("wardley.stage.product"), t("wardley.stage.commodity")];

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

/** Pipeline box height (px), sub-component square half-size (px), and the
 *  horizontal breathing room the box extends past the evolution range so the
 *  end squares don't sit flush against its rounded caps. */
const PIPELINE_BOX_H = 14;
const PIPELINE_ITEM_R = 5;
const PIPELINE_BOX_PAD_X = 12;
/** Vertical lift for an evolution arrow when its component is also a pipeline,
 *  so the dashed arrow rides clear of the box instead of overlapping it. */
const PIPELINE_EVOLVE_OFFSET = PIPELINE_BOX_H / 2 + NODE_R + 2;


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
    // Pad the box outward from the evolution range (clamped to the plot) so the
    // end squares and their labels have breathing room inside the rounded caps.
    const xLeft = Math.max(PLOT_X, toSvgX(pipe.x1) - PIPELINE_BOX_PAD_X);
    const xRight = Math.min(PLOT_X + PLOT_W, toSvgX(pipe.x2) + PIPELINE_BOX_PAD_X);

    const g = createSvgEl("g", { class: "vzd-wardley-pipeline-g" });

    // The enclosing box (rounded rectangle spanning the evolution range).
    // Clamp its vertical extent to the plot frame so a top/bottom pipeline
    // hugs the axis rather than poking a wide bar past it.
    const boxTop = Math.max(PLOT_Y, y - PIPELINE_BOX_H / 2);
    const boxBottom = Math.min(PLOT_Y + PLOT_H, y + PIPELINE_BOX_H / 2);
    g.appendChild(createSvgEl("rect", {
      x: String(xLeft), y: String(boxTop),
      width: String(xRight - xLeft), height: String(boxBottom - boxTop),
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
  const pipelined = new Set(data.pipelines.map((p) => p.component));
  const refs: EvolveRef[] = [];
  for (const comp of data.components) {
    if (comp.evolveTo === undefined) continue;
    // A pipelined component's box sits on its visibility line; lift the arrow
    // above it so the two don't overlap.
    const y = toSvgY(comp.visibility) - (pipelined.has(comp.name) ? PIPELINE_EVOLVE_OFFSET : 0);
    const x1 = toSvgX(comp.evolution);
    const x2 = toSvgX(comp.evolveTo);
    const { x1: lineX1, x2: lineX2 } = evolveLineEndpoints(x1, x2);

    const g = createSvgEl("g", { class: "vzd-wardley-evolve-g" });
    const line = createSvgEl("line", {
      x1: String(lineX1), y1: String(y),
      x2: String(lineX2), y2: String(y),
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

// ── Public entry point ─────────────────────────────────────────────────────

export function renderWardleyMap(
  data: WardleyMap,
  container: HTMLElement,
  rc: RenderContext = {},
): void {
  const { app, ctx, source } = rc;
  const isEditMode = !!(app && ctx && isEditModeActive(app));
  const defaultTitle = "Wardley Map";
  const title = source !== undefined ? parseTitle(source, defaultTitle) : defaultTitle;
  const onTitleEdit = (isEditMode && source !== undefined)
    ? (newTitle: string) => writeCanvasTitle(app!, ctx!, container, newTitle, defaultTitle)
    : undefined;
  initCanvas(container, "wardley", title, undefined, source, onTitleEdit, app, ctx);
  renderCanvasWarnings(container, data.warnings);

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
