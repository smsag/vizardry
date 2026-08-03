/**
 * Edit-mode interaction behaviours for the Wardley Map: drag-to-reposition,
 * drag the evolution "to-be" marker, the + handle + link-draw gesture, and
 * double-click-to-rename. Split out of wardley.ts to keep that file focused on
 * static rendering. Depends only on wardley-geometry (shared math/refs) and the
 * shared edit writers — never back on wardley.ts — so there is no import cycle.
 */

import type { App, MarkdownPostProcessorContext } from "obsidian";
import type { WardleyMap } from "../types";
import { t } from "../i18n";
import { createSvgEl } from "../shared/svg";
import { onDisconnected } from "../shared/lifecycle";
import { wireRenameInputKeys, createBlurGuard } from "./inline-edit";
import { writeWardleyComponent, addWardleyComponent, renameWardleyComponent, writeWardleyEvolve } from "../shared/wardley-edit";
import {
  W, H, NODE_R, PLOT_X, PLOT_Y, PLOT_W, PLOT_H,
  clientToSvg, svgToData, labelAnchor, evolveLineEndpoints,
  type NodeRef, type EvolveRef,
} from "./wardley-geometry";

// ── Cross-cutting interaction state ────────────────────────────────────────

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
export type WardleyIxState = {
  drag: DragState | null;
  activeRename: ActiveRename | null;
  linkDraw: LinkDrawState | null;
  handleTarget: NodeRef | null;
  hideHandleTimer: ReturnType<typeof setTimeout> | null;
  addHandleG: SVGGElement;
};

// ── Interaction: drag to reposition ───────────────────────────────────────

export function attachDragBehavior(
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

export function attachEvolveDragBehavior(
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
    ref.circle.setAttribute("cx", String(cx));
    // Re-trim both ends so the arrow flips cleanly if dragged past the source,
    // and collapses (rather than inverting) when dragged onto it.
    const { x1, x2 } = evolveLineEndpoints(ref.fromX, cx);
    ref.line.setAttribute("x1", String(x1));
    ref.line.setAttribute("x2", String(x2));
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

export function attachLinkDrawBehavior(
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

export function attachRenameBehavior(
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

