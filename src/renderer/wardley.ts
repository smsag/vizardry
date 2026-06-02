import type { App, MarkdownPostProcessorContext } from "obsidian";
import type { WardleyMap, WardleyComponent } from "../types";
import { t } from "../i18n";
import { initCanvas } from "./controls";
import { parseTitle, writeCanvasTitle } from "../shared/title-edit";
import { createSvgEl } from "../shared/svg";
import { WARDLEY_CHAR_W_PX, WARDLEY_LABEL_MIN_GAP_PX, WARDLEY_LABEL_OVERLAP_X_PX, WARDLEY_LABEL_MAX_NUDGE_PX } from "../shared/constants";
import { writeWardleyComponent, addWardleyComponent, renameWardleyComponent } from "../shared/wardley-edit";

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
  if (!ctm) return { x: 0, y: 0 };
  const pt = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
  return { x: pt.x, y: pt.y };
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

      // Skip if b is already at its maximum allowed displacement
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
        // Cap so b never moves more than WARDLEY_LABEL_MAX_NUDGE_PX from its natural position
        const remaining = WARDLEY_LABEL_MAX_NUDGE_PX - (b.textY - b.naturalY);
        b.textY += Math.min(push, Math.max(0, remaining));
      }
    }
  }
}

export function renderWardleyMap(
  data: WardleyMap,
  container: HTMLElement,
  app?: App,
  ctx?: MarkdownPostProcessorContext,
  source?: string,
): void {
  const defaultTitle = "Wardley Map";
  const title = source !== undefined ? parseTitle(source, defaultTitle) : defaultTitle;
  const onTitleEdit = (app && ctx && source !== undefined)
    ? (newTitle: string) => writeCanvasTitle(app, ctx, container, newTitle, defaultTitle)
    : undefined;
  initCanvas(container, "wardley", title, undefined, source, onTitleEdit);

  const wrap = container.createEl("div", { cls: "vzd-wardley-wrap" });

  const svg = createSvgEl("svg", {
    viewBox: `0 0 ${W} ${H}`,
    class: "vzd-wardley-svg",
  }) as SVGSVGElement;

  // ── Defs (arrow marker) ────────────────────────────────────────────────
  const defs = createSvgEl("defs");
  const marker = createSvgEl("marker", {
    id: "vzd-wardley-arrow", markerWidth: "8", markerHeight: "8",
    refX: "6", refY: "3", orient: "auto",
  });
  const markerPath = createSvgEl("path", { d: "M0,0 L0,6 L8,3 z", class: "vzd-wardley-arrowhead" });
  marker.appendChild(markerPath);
  defs.appendChild(marker);
  svg.appendChild(defs);

  // ── Evolution stage bands and labels ──────────────────────────────────
  const stageW = PLOT_W / evolutionStages().length;
  evolutionStages().forEach((stage, i) => {
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

  // ── Axis lines and labels ──────────────────────────────────────────────
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

  // ── Build component lookup for link drawing ────────────────────────────
  const compMap = new Map<string, WardleyComponent>();
  for (const c of data.components) compMap.set(c.name, c);

  // ── Links ──────────────────────────────────────────────────────────────
  for (const link of data.links) {
    const from = compMap.get(link.from), to = compMap.get(link.to);
    if (!from || !to) continue;
    const x1 = toSvgX(from.evolution), y1 = toSvgY(from.visibility);
    const x2 = toSvgX(to.evolution),   y2 = toSvgY(to.visibility);
    const dx = x2 - x1, dy = y2 - y1;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const ex = (dx / dist) * (NODE_R + 2), ey = (dy / dist) * (NODE_R + 2);
    svg.appendChild(createSvgEl("line", {
      x1: String(x1 + ex), y1: String(y1 + ey),
      x2: String(x2 - ex), y2: String(y2 - ey),
      class: "vzd-wardley-link", "marker-end": "url(#vzd-wardley-arrow)",
    }));
  }

  // ── Nodes ──────────────────────────────────────────────────────────────
  const labelSlots: LabelSlot[] = data.components.map(comp => {
    const cx = toSvgX(comp.evolution), cy = toSvgY(comp.visibility);
    const { dx, dy, anchor } = labelAnchor(comp.evolution, comp.visibility);
    const textY = cy + dy;
    return { textX: cx + dx, textY, naturalY: textY, anchor, name: comp.name };
  });
  nudgeLabels(labelSlots);

  type NodeRef = { circle: SVGCircleElement; textEl: SVGTextElement; comp: WardleyComponent };
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

    const slot = labelSlots[i];

    // Leader line — drawn when the nudge has moved the label significantly
    // from its natural position, keeping the visual connection to the node.
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

  wrap.appendChild(svg);

  // ── Drag to reposition (Live Preview only) ─────────────────────────────
  if (app && ctx) {
    // Tooltip: SVG text element shown near the dragged dot during drag
    const tooltipG = createSvgEl("g", { class: "vzd-wardley-drag-tooltip" }) as SVGGElement;
    tooltipG.style.display = "none";
    const tooltipBg = createSvgEl("rect", {
      rx: "4", class: "vzd-wardley-drag-tooltip-bg",
    }) as SVGRectElement;
    const tooltipTxt = createSvgEl("text", {
      class: "vzd-wardley-drag-tooltip-text",
      "dominant-baseline": "middle",
    }) as SVGTextElement;
    tooltipG.appendChild(tooltipBg);
    tooltipG.appendChild(tooltipTxt);
    svg.appendChild(tooltipG);

    type DragState = { ref: NodeRef };
    let drag: DragState | null = null;

    const updateTooltip = (cx: number, cy: number, vis: number, evo: number): void => {
      const text = `vis ${vis.toFixed(2)}  evo ${evo.toFixed(2)}`;
      tooltipTxt.textContent = text;
      // Position tooltip above-right of the node, flip left when near right edge
      const tipX = cx + PLOT_X * 0.1 < W - 120 ? cx + NODE_R + 6 : cx - NODE_R - 6;
      const tipAnchor = cx + NODE_R + 6 < W - 120 ? "start" : "end";
      tooltipTxt.setAttribute("x", String(tipX));
      tooltipTxt.setAttribute("y", String(cy - NODE_R - 8));
      tooltipTxt.setAttribute("text-anchor", tipAnchor);
      // Sync background rect to text bounds (approximate)
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
      // Clamp to plot area
      const cx = Math.max(PLOT_X, Math.min(PLOT_X + PLOT_W, svgX));
      const cy = Math.max(PLOT_Y, Math.min(PLOT_Y + PLOT_H, svgY));
      const { visibility, evolution } = svgToData(cx, cy);

      ref.circle.setAttribute("cx", String(cx));
      ref.circle.setAttribute("cy", String(cy));

      // Update label without nudge (raw position during drag)
      const { dx, dy, anchor } = labelAnchor(evolution, visibility);
      ref.textEl.setAttribute("x", String(cx + dx));
      ref.textEl.setAttribute("y", String(cy + dy));
      ref.textEl.setAttribute("text-anchor", anchor);

      updateTooltip(cx, cy, visibility, evolution);
    };

    const endDrag = (): void => {
      if (!drag) return;
      const { ref } = drag;
      drag = null;

      tooltipG.style.display = "none";
      ref.circle.classList.remove("vzd-wardley-node--dragging");
      svg.classList.remove("vzd-wardley-svg--dragging");

      const cx = parseFloat(ref.circle.getAttribute("cx") ?? "0");
      const cy = parseFloat(ref.circle.getAttribute("cy") ?? "0");
      const { visibility, evolution } = svgToData(cx, cy);

      writeWardleyComponent(app, ctx, wrap, ref.comp.name, visibility, evolution);

      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    const onMouseMove = (e: MouseEvent): void => {
      if (drag) moveDot(drag.ref, e.clientX, e.clientY);
    };
    const onMouseUp = (): void => endDrag();

    for (const ref of nodeRefs) {
      if (!data.explicitComponents.has(ref.comp.name)) continue; // anchor-only: no source line

      ref.circle.classList.add("vzd-wardley-node--draggable");

      const startDrag = (clientX: number, clientY: number): void => {
        drag = { ref };
        ref.circle.classList.add("vzd-wardley-node--dragging");
        svg.classList.add("vzd-wardley-svg--dragging");
        moveDot(ref, clientX, clientY);
        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
      };

      ref.circle.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        startDrag(e.clientX, e.clientY);
      });

      // Touch support
      ref.circle.addEventListener("touchstart", (e) => {
        e.preventDefault();
        startDrag(e.touches[0].clientX, e.touches[0].clientY);
      }, { passive: false });

      svg.addEventListener("touchmove", (e) => {
        if (!drag) return;
        e.preventDefault();
        moveDot(drag.ref, e.touches[0].clientX, e.touches[0].clientY);
      }, { passive: false });

      svg.addEventListener("touchend", () => endDrag());
    }

    // ── + handle and link-draw gesture ──────────────────────────────────
    // Hovering a draggable node reveals a small "+" handle at its right edge.
    // Dragging from the handle creates a new connected component; Escape
    // creates the component without a link.

    // Shared "+" handle — one element repositioned to whichever node is hovered
    const addHandleG = createSvgEl("g", { class: "vzd-wardley-add-handle-g" }) as SVGGElement;
    addHandleG.style.display = "none";
    const addHandleCircle = createSvgEl("circle", {
      cx: "0", cy: "0", r: "7", class: "vzd-wardley-add-handle",
    }) as SVGCircleElement;
    const addHandlePlus = createSvgEl("text", {
      x: "0", y: "0.5", class: "vzd-wardley-add-handle-icon",
      "text-anchor": "middle", "dominant-baseline": "middle",
    }) as SVGTextElement;
    addHandlePlus.textContent = "+";
    addHandleG.appendChild(addHandleCircle);
    addHandleG.appendChild(addHandlePlus);
    svg.appendChild(addHandleG);

    type LinkDrawState = {
      sourceRef: NodeRef;
      ghostLine: SVGLineElement;
      ghostDot: SVGCircleElement;
      hasMoved: boolean;
    };
    let linkDraw: LinkDrawState | null = null;
    let hideHandleTimer: ReturnType<typeof setTimeout> | null = null;
    let handleTarget: NodeRef | null = null;

    const positionHandle = (ref: NodeRef): void => {
      const cx = parseFloat(ref.circle.getAttribute("cx") ?? "0");
      const cy = parseFloat(ref.circle.getAttribute("cy") ?? "0");
      addHandleG.setAttribute("transform", `translate(${cx + NODE_R + 12}, ${cy})`);
      addHandleG.style.display = "";
      handleTarget = ref;
    };

    const scheduleHideHandle = (): void => {
      if (hideHandleTimer) clearTimeout(hideHandleTimer);
      hideHandleTimer = setTimeout(() => {
        if (!linkDraw) { addHandleG.style.display = "none"; handleTarget = null; }
      }, 120);
    };

    const cancelHideHandle = (): void => {
      if (hideHandleTimer) { clearTimeout(hideHandleTimer); hideHandleTimer = null; }
    };

    for (const ref of nodeRefs) {
      if (!data.explicitComponents.has(ref.comp.name)) continue;
      ref.circle.addEventListener("mouseenter", () => {
        if (drag) return;
        cancelHideHandle();
        positionHandle(ref);
      });
      ref.circle.addEventListener("mouseleave", () => scheduleHideHandle());
    }
    addHandleG.addEventListener("mouseenter", () => cancelHideHandle());
    addHandleG.addEventListener("mouseleave", () => scheduleHideHandle());

    const onLinkMove = (e: MouseEvent): void => {
      if (!linkDraw) return;
      const { x, y } = clientToSvg(svg, e.clientX, e.clientY);
      const cx = Math.max(PLOT_X, Math.min(PLOT_X + PLOT_W, x));
      const cy = Math.max(PLOT_Y, Math.min(PLOT_Y + PLOT_H, y));
      linkDraw.ghostLine.setAttribute("x2", String(cx));
      linkDraw.ghostLine.setAttribute("y2", String(cy));
      linkDraw.ghostDot.setAttribute("cx", String(cx));
      linkDraw.ghostDot.setAttribute("cy", String(cy));
      if (!linkDraw.hasMoved) {
        const srcCx = parseFloat(linkDraw.sourceRef.circle.getAttribute("cx") ?? "0");
        const srcCy = parseFloat(linkDraw.sourceRef.circle.getAttribute("cy") ?? "0");
        if (Math.hypot(cx - srcCx, cy - srcCy) > NODE_R * 2) linkDraw.hasMoved = true;
      }
    };

    const endLinkDraw = (withLink: boolean): void => {
      if (!linkDraw) return;
      const { sourceRef, ghostLine, ghostDot, hasMoved } = linkDraw;
      linkDraw = null;
      ghostLine.remove();
      ghostDot.remove();
      addHandleG.style.display = "none";
      svg.classList.remove("vzd-wardley-svg--drawing");
      document.removeEventListener("mousemove", onLinkMove);
      document.removeEventListener("mouseup", onLinkUp);
      document.removeEventListener("keydown", onLinkKey);
      if (!hasMoved) return; // no meaningful movement — cancel silently
      const cx = parseFloat(ghostDot.getAttribute("cx") ?? "0");
      const cy = parseFloat(ghostDot.getAttribute("cy") ?? "0");
      const { visibility, evolution } = svgToData(cx, cy);
      addWardleyComponent(app, ctx, wrap, sourceRef.comp.name, "New Component", visibility, evolution, withLink);
    };

    const onLinkUp = (): void => endLinkDraw(true);
    const onLinkKey = (e: KeyboardEvent): void => { if (e.key === "Escape") endLinkDraw(false); };

    addHandleCircle.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!handleTarget) return;
      const sourceRef = handleTarget;
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

      linkDraw = { sourceRef, ghostLine, ghostDot, hasMoved: false };
      addHandleG.style.display = "none";
      svg.classList.add("vzd-wardley-svg--drawing");
      document.addEventListener("mousemove", onLinkMove);
      document.addEventListener("mouseup", onLinkUp);
      document.addEventListener("keydown", onLinkKey);
    });

    // ── Double-click to rename ─────────────────────────────────────────────
    // Double-clicking any draggable component's circle or label opens a
    // positioned <input> over the label so the user can rename it in-place.

    const activateRename = (ref: NodeRef): void => {
      // Don't open a second input while one is already active
      if (wrap.querySelector(".vzd-wardley-rename-input")) return;

      const textRect = ref.textEl.getBoundingClientRect();
      const wrapRect = wrap.getBoundingClientRect();

      const input = document.createElement("input");
      input.type = "text";
      input.value = ref.comp.name;
      input.className = "vzd-wardley-rename-input";
      input.style.position = "absolute";
      input.style.left = `${textRect.left - wrapRect.left + wrap.scrollLeft}px`;
      input.style.top  = `${textRect.top  - wrapRect.top  + wrap.scrollTop  - 6}px`;
      input.style.width = `${Math.max(100, textRect.width + 24)}px`;

      wrap.appendChild(input);
      input.focus();
      input.select();

      let committed = false;

      const commit = (): void => {
        if (committed) return;
        committed = true;
        input.remove();
        const newName = input.value.trim();
        if (newName && newName !== ref.comp.name) {
          renameWardleyComponent(app, ctx, wrap, ref.comp.name, newName);
        }
      };

      const cancel = (): void => {
        committed = true;
        input.remove();
      };

      input.addEventListener("blur", commit);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter")  { e.preventDefault(); commit(); }
        if (e.key === "Escape") { e.preventDefault(); cancel(); }
        e.stopPropagation(); // don't leak keystrokes to SVG handlers
      });
    };

    for (const ref of nodeRefs) {
      if (!data.explicitComponents.has(ref.comp.name)) continue;
      ref.textEl.addEventListener("dblclick", (e) => { e.stopPropagation(); activateRename(ref); });
      ref.circle.addEventListener("dblclick", (e) => { e.stopPropagation(); activateRename(ref); });
    }
  }
}

