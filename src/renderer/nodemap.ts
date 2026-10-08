import type { App, MarkdownPostProcessorContext } from "obsidian";
import type { NodeMapBox, NodeMapData, NodeMapColor } from "../types";
import type { RenderContext } from "./render-context";
import { initCanvas, showWriteFailedNotice } from "./controls";
import { parseTitle, writeCanvasTitle } from "../shared/title-edit";
import { isEditModeActive } from "../shared/editor";
import { createSvgEl } from "../shared/svg";
import { onDisconnected } from "../shared/lifecycle";
import { rectBoundary, type Vec2 } from "../shared/geometry";
import { estimateCharsPerLine, wrappedLineCount } from "../shared/svg-box";
const NODEMAP_PALETTE: Record<string, string> = {
  red: "hsl(0, 70%, 55%)",
  orange: "hsl(28, 85%, 55%)",
  yellow: "hsl(48, 85%, 50%)",
  green: "hsl(145, 55%, 42%)",
  teal: "hsl(175, 55%, 40%)",
  blue: "hsl(220, 65%, 55%)",
  purple: "hsl(270, 55%, 55%)",
  pink: "hsl(330, 65%, 60%)",
  gray: "hsl(220, 10%, 55%)",
};

function resolveNodeMapColor(color: NodeMapColor): string {
  return color.startsWith("#") ? color : (NODEMAP_PALETTE[color] ?? color);
}
import { editTextInPlace } from "./inline-edit";
import {
  writeNodeMapBoxPosition, addNodeMapBox, removeNodeMapBox, renameNodeMapBox,
  writeNodeMapBoxBody, setNodeMapBoxColor, addNodeMapLink, removeNodeMapLink,
} from "../shared/nodemap-edit";
import { t } from "../i18n";
import { attachSvgItemMenu } from "../shared/item-menu";

const PAD = 40;
const CHAR_W = 7;
const MIN_BOX_WIDTH = 110;
const MAX_BOX_WIDTH = 220;
const BOX_PAD_X = 12;
const HEADER_H = 32;
const BODY_LINE_H = 16;
const BODY_PAD_Y = 10;
const NODE_RX = 8;
const ARROW_LEN = 9;
const LABEL_OFFSET = 13;
/** Gap between auto-placed boxes, and between them and the positioned ones. */
const AUTO_GAP = 40;
/** Auto-placed boxes wrap to a new row past this width. */
const AUTO_ROW_WIDTH = 720;
/** Screen pixels a press must travel before it counts as a drag, so a
 *  double-click to edit never nudges the box. */
const DRAG_THRESHOLD_PX = 3;
/** "+" handle: its gap from the box's right edge and its hit radius. */
const HANDLE_GAP = 10;
const HANDLE_HIT_R = 13;
/** Margin around a box (and its handle) within which the handle stays shown. */
const HANDLE_ZONE_PAD = 12;

export interface MeasuredBox extends NodeMapBox {
  width: number;
  height: number;
}

interface BoxRef {
  g: SVGGElement;
  rect: SVGRectElement;
  fo: SVGForeignObjectElement;
  nameEl: HTMLElement;
  box: MeasuredBox;
}

function measureBox(box: NodeMapBox): { width: number; height: number } {
  const nameW = box.name.length * CHAR_W + BOX_PAD_X * 2;
  const width = Math.max(MIN_BOX_WIDTH, Math.min(MAX_BOX_WIDTH, nameW));
  let height = HEADER_H;
  if (box.body) {
    const charsPerLine = estimateCharsPerLine(width - BOX_PAD_X * 2, { charW: CHAR_W, min: 10 });
    const lines = wrappedLineCount(box.body, charsPerLine);
    height += lines * BODY_LINE_H + BODY_PAD_Y;
  }
  return { width, height };
}

/**
 * Places boxes declared without coordinates: in rows below every positioned
 * box (or from the top-left when none is), left to right, wrapping past
 * AUTO_ROW_WIDTH. Mutates the boxes in place.
 */
export function placeAutoBoxes(boxes: MeasuredBox[]): void {
  const fixed = boxes.filter(b => !b.auto);
  const auto = boxes.filter(b => b.auto);
  if (auto.length === 0) return;
  let x = AUTO_GAP;
  let y = fixed.length > 0 ? Math.max(...fixed.map(b => b.y + b.height)) + AUTO_GAP : AUTO_GAP;
  let rowH = 0;
  for (const box of auto) {
    if (x > AUTO_GAP && x + box.width > AUTO_ROW_WIDTH) {
      x = AUTO_GAP;
      y += rowH + AUTO_GAP;
      rowH = 0;
    }
    box.x = x;
    box.y = y;
    x += box.width + AUTO_GAP;
    rowH = Math.max(rowH, box.height);
  }
}

/** Convert client (screen) coordinates to the SVG's own coordinate space,
 *  reading the SVG's current (dynamically-sized) viewBox for the fallback
 *  path used in environments without DOMPoint.matrixTransform (e.g. tests). */
function clientToSvg(svg: SVGSVGElement, clientX: number, clientY: number): Vec2 {
  const ctm = svg.getScreenCTM();
  if (ctm && typeof DOMPoint !== "undefined") {
    const point = new DOMPoint(clientX, clientY) as DOMPoint & { matrixTransform?: (m: DOMMatrix) => DOMPoint };
    if (typeof point.matrixTransform === "function") {
      const pt = point.matrixTransform(ctm.inverse());
      return { x: pt.x, y: pt.y };
    }
  }
  const rect = svg.getBoundingClientRect();
  const vb = svg.viewBox.baseVal;
  if (rect.width <= 0 || rect.height <= 0 || !vb) return { x: 0, y: 0 };
  return {
    x: vb.x + ((clientX - rect.left) / rect.width) * vb.width,
    y: vb.y + ((clientY - rect.top) / rect.height) * vb.height,
  };
}

type DragState = {
  ref: BoxRef;
  pointerId: number;
  /** Where the press started (client px), to apply DRAG_THRESHOLD_PX. */
  startClientX: number;
  startClientY: number;
  /** Pointer position within the box (SVG units), kept under the cursor. */
  grabX: number;
  grabY: number;
  /** Box position before the drag, restored on cancel. */
  originX: number;
  originY: number;
  moved: boolean;
};
type LinkDrawState = { sourceRef: BoxRef; ghostLine: SVGLineElement; hasMoved: boolean };
type ActiveEdit = { close: () => void };

type NodeMapIxState = {
  drag: DragState | null;
  linkDraw: LinkDrawState | null;
  activeEdit: ActiveEdit | null;
};

function renderMarkerDefs(svg: SVGSVGElement): void {
  const defs = createSvgEl("defs");
  const end = createSvgEl("marker", {
    id: "vzd-nodemap-arrow-end", markerWidth: "10", markerHeight: "8",
    refX: "9", refY: "4", orient: "auto", markerUnits: "userSpaceOnUse",
  });
  end.appendChild(createSvgEl("path", { d: "M0,0 L10,4 L0,8 Z", class: "vzd-nodemap-arrowhead" }));
  defs.appendChild(end);

  const start = createSvgEl("marker", {
    id: "vzd-nodemap-arrow-start", markerWidth: "10", markerHeight: "8",
    refX: "1", refY: "4", orient: "auto", markerUnits: "userSpaceOnUse",
  });
  start.appendChild(createSvgEl("path", { d: "M10,0 L0,4 L10,8 Z", class: "vzd-nodemap-arrowhead" }));
  defs.appendChild(start);

  svg.appendChild(defs);
}

function boxCenter(box: MeasuredBox): Vec2 {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

function renderLinks(
  layer: SVGElement,
  data: NodeMapData,
  boxByName: Map<string, MeasuredBox>,
  isEditMode: boolean,
  app: App | undefined,
  ctx: MarkdownPostProcessorContext | undefined,
  wrap: HTMLElement,
): void {
  for (const link of data.links) {
    const from = boxByName.get(link.from.toLowerCase());
    const to = boxByName.get(link.to.toLowerCase());
    if (!from || !to) continue;

    const fromCenter = boxCenter(from), toCenter = boxCenter(to);
    const src = rectBoundary(fromCenter.x, fromCenter.y, from.width / 2, from.height / 2, toCenter.x, toCenter.y);
    const tgt = rectBoundary(toCenter.x, toCenter.y, to.width / 2, to.height / 2, fromCenter.x, fromCenter.y);

    const dx = tgt.x - src.x, dy = tgt.y - src.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;

    let x1 = src.x, y1 = src.y, x2 = tgt.x, y2 = tgt.y;
    if (link.direction === "bidirectional") { x1 += ux * ARROW_LEN; y1 += uy * ARROW_LEN; }
    if (link.direction === "directed" || link.direction === "bidirectional") { x2 -= ux * ARROW_LEN; y2 -= uy * ARROW_LEN; }

    const attrs: Record<string, string> = {
      x1: String(x1), y1: String(y1), x2: String(x2), y2: String(y2),
      class: `vzd-nodemap-link${link.style === "dashed" ? " vzd-nodemap-link--dashed" : ""}`,
    };
    if (link.direction === "directed" || link.direction === "bidirectional") attrs["marker-end"] = "url(#vzd-nodemap-arrow-end)";
    if (link.direction === "bidirectional") attrs["marker-start"] = "url(#vzd-nodemap-arrow-start)";

    const linkG = createSvgEl("g", { class: "vzd-nodemap-link-g" });
    const line = createSvgEl("line", attrs) as SVGLineElement;
    if (link.color) line.style.setProperty("--vzd-nodemap-color", resolveNodeMapColor(link.color));
    linkG.appendChild(line);

    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;

    if (link.label) {
      const px = -dy / len, py = dx / len;
      const lx = mx + px * LABEL_OFFSET, ly = my + py * LABEL_OFFSET;
      const labelW = Math.ceil(link.label.length * 6.2 + 12);
      linkG.appendChild(createSvgEl("rect", {
        x: String(lx - labelW / 2), y: String(ly - 9), width: String(labelW), height: "16", rx: "3",
        class: "vzd-nodemap-link-label-bg",
      }));
      const labelEl = createSvgEl("text", {
        x: String(lx), y: String(ly), class: "vzd-nodemap-link-label",
        "text-anchor": "middle", "dominant-baseline": "central",
      });
      labelEl.textContent = link.label;
      linkG.appendChild(labelEl);
    }

    if (isEditMode && app && ctx) {
      linkG.appendChild(createSvgEl("line", {
        x1: String(x1), y1: String(y1), x2: String(x2), y2: String(y2), class: "vzd-nodemap-link-hit",
      }));
      attachSvgItemMenu(linkG as SVGGElement, {
        label: t("menu.actionsFor", { name: `${link.from} → ${link.to}` }),
        x: mx, y: my,
        floating: true,
        actions: () => [{
          title: t("link.remove"),
          icon: "unlink",
          destructive: true,
          onChoose: () => removeNodeMapLink(app, ctx, wrap, link.from, link.to),
        }],
      });
    }

    layer.appendChild(linkG);
  }
}

function renderBoxes(svg: SVGSVGElement, boxes: MeasuredBox[]): BoxRef[] {
  const refs: BoxRef[] = [];
  for (const box of boxes) {
    const g = createSvgEl("g", { class: "vzd-nodemap-box-g" }) as SVGGElement;
    g.dataset.boxName = box.name;

    const rect = createSvgEl("rect", {
      x: String(box.x), y: String(box.y), width: String(box.width), height: String(box.height),
      rx: String(NODE_RX), class: "vzd-nodemap-box",
    }) as SVGRectElement;
    if (box.color) rect.style.setProperty("--vzd-nodemap-color", resolveNodeMapColor(box.color));
    g.appendChild(rect);

    const fo = createSvgEl("foreignObject", {
      x: String(box.x), y: String(box.y), width: String(box.width), height: String(box.height),
    }) as SVGForeignObjectElement;
    const host = document.createElement("div");
    host.className = "vzd-nodemap-box-host";
    const nameEl = document.createElement("div");
    nameEl.className = "vzd-nodemap-box-name";
    nameEl.textContent = box.name;
    host.appendChild(nameEl);
    if (box.body) {
      const bodyEl = document.createElement("div");
      bodyEl.className = "vzd-nodemap-box-body";
      bodyEl.textContent = box.body;
      host.appendChild(bodyEl);
    }
    fo.appendChild(host);
    g.appendChild(fo);

    svg.appendChild(g);
    refs.push({ g, rect, fo, nameEl, box });
  }
  return refs;
}

// ── Interaction: drag to reposition ───────────────────────────────────────

/** Moves a box's shapes (and its model) to a new top-left corner. */
function placeBox(ref: BoxRef, x: number, y: number): void {
  ref.box.x = x;
  ref.box.y = y;
  ref.rect.setAttribute("x", String(x));
  ref.rect.setAttribute("y", String(y));
  ref.fo.setAttribute("x", String(x));
  ref.fo.setAttribute("y", String(y));
}

/**
 * Drag a box from anywhere on it — the name and body sit in a foreignObject
 * over the rect, so the press is taken on the box's group, not the rect. The
 * point you grabbed stays under the pointer; `onMove` redraws what follows the
 * box (links, its handle and controls). Pointer events, so touch drags too.
 */
function attachDragBehavior(
  svg: SVGSVGElement,
  refs: BoxRef[],
  ix: NodeMapIxState,
  app: App,
  ctx: MarkdownPostProcessorContext,
  wrap: HTMLElement,
  onMove: (ref: BoxRef) => void,
): void {
  const doc = svg.ownerDocument;

  const stopListening = (): void => {
    doc.removeEventListener("pointermove", onPointerMove);
    doc.removeEventListener("pointerup", onPointerUp);
    doc.removeEventListener("pointercancel", onPointerCancel);
    doc.removeEventListener("keydown", onKey);
  };

  const endDrag = (commit: boolean): void => {
    const d = ix.drag;
    if (!d) return;
    ix.drag = null;
    stopListening();
    d.ref.g.classList.remove("vzd-nodemap-box-g--dragging");
    svg.classList.remove("vzd-nodemap-svg--dragging");
    // A press that never passed the threshold is a click (or half of a
    // double-click to edit), not a move: nothing to write.
    if (!d.moved) return;
    if (!commit) { placeBox(d.ref, d.originX, d.originY); onMove(d.ref); return; }
    if (!writeNodeMapBoxPosition(app, ctx, wrap, d.ref.box.name, d.ref.box.x, d.ref.box.y)) showWriteFailedNotice(wrap);
  };

  const onPointerMove = (e: PointerEvent): void => {
    const d = ix.drag;
    if (!d || e.pointerId !== d.pointerId) return;
    if (!d.moved) {
      if (Math.hypot(e.clientX - d.startClientX, e.clientY - d.startClientY) < DRAG_THRESHOLD_PX) return;
      d.moved = true;
      d.ref.g.classList.add("vzd-nodemap-box-g--dragging");
      svg.classList.add("vzd-nodemap-svg--dragging");
    }
    const { x, y } = clientToSvg(svg, e.clientX, e.clientY);
    placeBox(d.ref, Math.max(0, x - d.grabX), Math.max(0, y - d.grabY));
    onMove(d.ref);
  };
  const onPointerUp = (e: PointerEvent): void => { if (ix.drag?.pointerId === e.pointerId) endDrag(true); };
  const onPointerCancel = (e: PointerEvent): void => { if (ix.drag?.pointerId === e.pointerId) endDrag(false); };
  const onKey = (e: KeyboardEvent): void => { if (e.key === "Escape") endDrag(false); };

  onDisconnected(wrap, () => { stopListening(); ix.drag = null; });

  for (const ref of refs) {
    ref.g.classList.add("vzd-nodemap-box-g--draggable");
    ref.g.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || ix.drag || ix.linkDraw || ix.activeEdit) return;
      // The rename input / body textarea live inside the box: let them work.
      if (e.target instanceof Element && e.target.closest("input, textarea")) return;
      e.preventDefault();
      e.stopPropagation();
      const { x, y } = clientToSvg(svg, e.clientX, e.clientY);
      ix.drag = {
        ref, pointerId: e.pointerId,
        startClientX: e.clientX, startClientY: e.clientY,
        grabX: x - ref.box.x, grabY: y - ref.box.y,
        originX: ref.box.x, originY: ref.box.y,
        moved: false,
      };
      doc.addEventListener("pointermove", onPointerMove);
      doc.addEventListener("pointerup", onPointerUp);
      doc.addEventListener("pointercancel", onPointerCancel);
      doc.addEventListener("keydown", onKey);
    });
  }
}

// ── Interaction: "+" handle drag-to-connect two EXISTING boxes ────────────

/** Centre of a box's "+" handle, just off its right edge. */
function handleCenter(box: MeasuredBox): Vec2 {
  return { x: box.x + box.width + HANDLE_GAP, y: box.y + box.height / 2 };
}

/** True when `p` is on the box itself. */
function onBox(box: MeasuredBox, p: Vec2): boolean {
  return p.x >= box.x && p.x <= box.x + box.width && p.y >= box.y && p.y <= box.y + box.height;
}

/** True when `p` is within the area that keeps a box's handle shown: the box
 *  and its handle, plus a margin, so the pointer can travel from anywhere on
 *  the box (a corner, the controls, a tall body) to the "+" without it hiding. */
function inHandleZone(box: MeasuredBox, p: Vec2): boolean {
  const right = box.x + box.width + HANDLE_GAP + HANDLE_HIT_R;
  return p.x >= box.x - HANDLE_ZONE_PAD && p.x <= right + HANDLE_ZONE_PAD
    && p.y >= box.y - HANDLE_ZONE_PAD && p.y <= box.y + box.height + HANDLE_ZONE_PAD;
}

/**
 * Wires the "+" handles. Which box's handle is shown is decided from the
 * pointer position over the whole SVG rather than per-box enter/leave events:
 * those hid the handle whenever the pointer left the box anywhere but the
 * narrow band level with the handle — any tall box, any diagonal move. Returns
 * a function that moves a box's handle after the box moves.
 */
function attachLinkDrawBehavior(
  svg: SVGSVGElement,
  refs: BoxRef[],
  ix: NodeMapIxState,
  app: App,
  ctx: MarkdownPostProcessorContext,
  wrap: HTMLElement,
): (ref: BoxRef) => void {
  const doc = svg.ownerDocument;

  const findBoxUnderPoint = (clientX: number, clientY: number, exclude: BoxRef): BoxRef | null => {
    const els = doc.elementsFromPoint(clientX, clientY);
    for (const el of els) {
      const g = (el as Element).closest(".vzd-nodemap-box-g") as SVGGElement | null;
      if (!g) continue;
      const found = refs.find(r => r.g === g);
      if (found && found !== exclude) return found;
    }
    return null;
  };

  const onLinkMove = (e: MouseEvent): void => {
    if (!ix.linkDraw) return;
    const { x, y } = clientToSvg(svg, e.clientX, e.clientY);
    ix.linkDraw.ghostLine.setAttribute("x2", String(x));
    ix.linkDraw.ghostLine.setAttribute("y2", String(y));
    ix.linkDraw.hasMoved = true;
  };

  const endLinkDraw = (clientX: number, clientY: number): void => {
    if (!ix.linkDraw) return;
    const { sourceRef, ghostLine, hasMoved } = ix.linkDraw;
    ix.linkDraw = null;
    ghostLine.remove();
    svg.classList.remove("vzd-nodemap-svg--drawing");
    doc.removeEventListener("mousemove", onLinkMove);
    doc.removeEventListener("mouseup", onLinkUp);
    doc.removeEventListener("keydown", onLinkKey);
    if (!hasMoved) return;

    const target = findBoxUnderPoint(clientX, clientY, sourceRef);
    if (!target) return; // dropped on empty space — cancel, don't mint a new box
    addNodeMapLink(app, ctx, wrap, sourceRef.box.name, target.box.name);
  };

  const onLinkUp = (e: MouseEvent): void => endLinkDraw(e.clientX, e.clientY);
  const onLinkKey = (e: KeyboardEvent): void => {
    if (e.key !== "Escape" || !ix.linkDraw) return;
    ix.linkDraw.ghostLine.remove();
    ix.linkDraw = null;
    svg.classList.remove("vzd-nodemap-svg--drawing");
    doc.removeEventListener("mousemove", onLinkMove);
    doc.removeEventListener("mouseup", onLinkUp);
    doc.removeEventListener("keydown", onLinkKey);
  };

  onDisconnected(wrap, () => {
    doc.removeEventListener("mousemove", onLinkMove);
    doc.removeEventListener("mouseup", onLinkUp);
    doc.removeEventListener("keydown", onLinkKey);
    ix.linkDraw = null;
  });

  const handles = new Map<BoxRef, SVGGElement>();
  let shown: BoxRef | null = null;
  const show = (ref: BoxRef | null): void => {
    if (ref === shown) return;
    if (shown) handles.get(shown)!.style.display = "none";
    shown = ref;
    if (ref) handles.get(ref)!.style.display = "";
  };

  const placeHandle = (ref: BoxRef): void => {
    const c = handleCenter(ref.box);
    handles.get(ref)?.setAttribute("transform", `translate(${c.x}, ${c.y})`);
  };

  svg.addEventListener("pointermove", (e) => {
    if (ix.linkDraw) return; // keep the source handle while drawing
    if (ix.drag || ix.activeEdit || e.pointerType === "touch") { show(null); return; }
    const p = clientToSvg(svg, e.clientX, e.clientY);
    // Later boxes paint over earlier ones: search topmost first, and prefer
    // the box actually under the pointer over a neighbour's margin.
    let hit: BoxRef | null = null;
    for (let i = refs.length - 1; i >= 0 && !hit; i--) if (onBox(refs[i].box, p)) hit = refs[i];
    for (let i = refs.length - 1; i >= 0 && !hit; i--) if (inHandleZone(refs[i].box, p)) hit = refs[i];
    show(hit);
  });
  svg.addEventListener("pointerleave", () => { if (!ix.linkDraw) show(null); });

  for (const ref of refs) {
    const handle = createSvgEl("g", { class: "vzd-nodemap-add-handle-g" }) as SVGGElement;
    handles.set(ref, handle);
    placeHandle(ref);
    handle.appendChild(createSvgEl("circle", { cx: "0", cy: "0", r: String(HANDLE_HIT_R), class: "vzd-nodemap-add-handle-hit" }));
    handle.appendChild(createSvgEl("circle", { cx: "0", cy: "0", r: "7", class: "vzd-nodemap-add-handle" }));
    const plus = createSvgEl("text", { x: "0", y: "0.5", class: "vzd-nodemap-add-handle-icon", "text-anchor": "middle", "dominant-baseline": "middle" });
    plus.textContent = "+";
    handle.appendChild(plus);
    svg.appendChild(handle);
    handle.style.display = "none";

    handle.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (ix.activeEdit || ix.drag) return;
      const center = boxCenter(ref.box);
      const h = handleCenter(ref.box);
      const start = rectBoundary(center.x, center.y, ref.box.width / 2, ref.box.height / 2, h.x, h.y);
      const ghostLine = createSvgEl("line", {
        x1: String(start.x), y1: String(start.y), x2: String(start.x), y2: String(start.y),
        class: "vzd-nodemap-link-draft",
      }) as SVGLineElement;
      svg.appendChild(ghostLine);
      ix.linkDraw = { sourceRef: ref, ghostLine, hasMoved: false };
      svg.classList.add("vzd-nodemap-svg--drawing");
      doc.addEventListener("mousemove", onLinkMove);
      doc.addEventListener("mouseup", onLinkUp);
      doc.addEventListener("keydown", onLinkKey);
    });
  }

  return placeHandle;
}

// ── Interaction: double-click to rename / edit body ───────────────────────

/**
 * Double-click a box's name or body to edit it where it stands, like a canvas
 * title: the text itself becomes editable, in the box's own font and place,
 * with no input or textarea laid over it. The name saves on Enter; the body
 * takes new lines and saves on Mod+Enter. Both save on blur, revert on Escape.
 */
function attachEditBehavior(
  refs: BoxRef[],
  ix: NodeMapIxState,
  app: App,
  ctx: MarkdownPostProcessorContext,
  wrap: HTMLElement,
): void {
  for (const ref of refs) {
    ref.nameEl.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      if (ix.drag || ix.linkDraw || ix.activeEdit) return;
      ix.activeEdit = { close: () => { ix.activeEdit = null; } };
      editTextInPlace(ref.nameEl, {
        initial: ref.box.name,
        onDone: (commit, value) => {
          ix.activeEdit = null;
          const newName = value.replace(/\s+/g, " ").trim();
          if (!commit || !newName || newName === ref.box.name) { ref.nameEl.textContent = ref.box.name; return; }
          ref.nameEl.textContent = newName;
          renameNodeMapBox(app, ctx, wrap, ref.box.name, newName);
        },
      });
    });

    const bodyEl = ref.fo.querySelector<HTMLElement>(".vzd-nodemap-box-body");
    if (bodyEl) {
      bodyEl.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        if (ix.drag || ix.linkDraw || ix.activeEdit) return;
        ix.activeEdit = { close: () => { ix.activeEdit = null; } };
        const before = ref.box.body ?? "";
        editTextInPlace(bodyEl, {
          initial: before,
          multiline: true,
          onDone: (commit, value) => {
            ix.activeEdit = null;
            const newBody = value.split("\n").map(l => l.trim()).filter(Boolean).join("\n");
            if (!commit || newBody === before) { bodyEl.textContent = before; return; }
            bodyEl.textContent = newBody;
            writeNodeMapBoxBody(app, ctx, wrap, ref.box.name, newBody);
          },
        });
      });
    }
  }
}

// ── Interaction: delete box, color swatch, add box on empty space ────────

const NODEMAP_SWATCHES = ["red", "orange", "yellow", "green", "teal", "blue", "purple", "pink", "gray"] as const;

// Per-wrap teardown for the currently-open colour popover's outside-click
// listener, so every close path (outside click, swatch pick, reopen) removes it
// — not only the outside-click path.
const colorPopoverCleanups = new WeakMap<HTMLElement, () => void>();

function closeColorPopover(wrap: HTMLElement): void {
  wrap.querySelector(".vzd-nodemap-color-popover")?.remove();
  colorPopoverCleanups.get(wrap)?.();
  colorPopoverCleanups.delete(wrap);
}

function openColorPopover(
  wrap: HTMLElement,
  anchorEl: SVGGraphicsElement,
  onPick: (color: string | null) => void,
): void {
  closeColorPopover(wrap);
  const wrapRect = wrap.getBoundingClientRect();
  const anchorRect = anchorEl.getBoundingClientRect();
  const popover = document.createElement("div");
  popover.className = "vzd-nodemap-color-popover";
  popover.style.left = `${anchorRect.left - wrapRect.left + wrap.scrollLeft}px`;
  popover.style.top = `${anchorRect.bottom - wrapRect.top + wrap.scrollTop + 4}px`;

  for (const name of NODEMAP_SWATCHES) {
    const swatch = document.createElement("button");
    swatch.className = "vzd-nodemap-color-swatch";
    swatch.style.setProperty("--vzd-nodemap-color", resolveNodeMapColor(name));
    swatch.setAttribute("aria-label", name);
    swatch.addEventListener("click", (e) => { e.stopPropagation(); onPick(name); closeColorPopover(wrap); });
    popover.appendChild(swatch);
  }
  const clearBtn = document.createElement("button");
  clearBtn.className = "vzd-nodemap-color-swatch vzd-nodemap-color-swatch--clear";
  clearBtn.setAttribute("aria-label", "clear color");
  clearBtn.textContent = "×";
  clearBtn.addEventListener("click", (e) => { e.stopPropagation(); onPick(null); closeColorPopover(wrap); });
  popover.appendChild(clearBtn);

  wrap.appendChild(popover);
  // Bind to the wrap's own document so outside-click dismissal works in a
  // pop-out window, and register the removal so any close path tears it down.
  const doc = wrap.ownerDocument;
  const onDocClick = (e: MouseEvent): void => {
    if (e.target instanceof Node && popover.contains(e.target)) return;
    closeColorPopover(wrap);
  };
  doc.addEventListener("mousedown", onDocClick, true);
  colorPopoverCleanups.set(wrap, () => doc.removeEventListener("mousedown", onDocClick, true));
}

/** Centre of a box's `⋯` trigger, in from its top-right corner. */
const BOX_MENU_INSET = 14;

/** Wires each box's actions menu. Returns a function that moves a box's `⋯`
 *  after the box moves. */
function attachBoxControls(
  refs: BoxRef[],
  app: App,
  ctx: MarkdownPostProcessorContext,
  wrap: HTMLElement,
): (ref: BoxRef) => void {
  const placers = new Map<BoxRef, () => void>();
  for (const ref of refs) {
    // One `⋯` per box, inside the box's own group: hovering the box reveals
    // it, and right-click / long-press anywhere on the box open the same menu.
    // Colour lives in that menu too, so a box carries a single control.
    const menu = attachSvgItemMenu(ref.g, {
      label: t("menu.actionsFor", { name: ref.box.name }),
      x: 0, y: 0,
      actions: () => [
        {
          title: t("nodemap.changeColor"),
          icon: "palette",
          onChoose: () => openColorPopover(wrap, menu.trigger, (color) => {
            setNodeMapBoxColor(app, ctx, wrap, ref.box.name, color as NodeMapColor | null);
          }),
        },
        {
          title: t("nodemap.deleteBox"),
          icon: "trash-2",
          destructive: true,
          onChoose: () => removeNodeMapBox(app, ctx, wrap, ref.box.name),
        },
      ],
    });

    const place = (): void => {
      menu.moveTo(ref.box.x + ref.box.width - BOX_MENU_INSET, ref.box.y + BOX_MENU_INSET);
    };
    place();
    placers.set(ref, place);
  }
  return (ref) => placers.get(ref)?.();
}

function attachAddBoxOnEmptySpace(
  svg: SVGSVGElement,
  ix: NodeMapIxState,
  app: App,
  ctx: MarkdownPostProcessorContext,
  wrap: HTMLElement,
): void {
  svg.addEventListener("dblclick", (e) => {
    if (e.target !== svg || ix.activeEdit || ix.drag || ix.linkDraw) return;
    const { x, y } = clientToSvg(svg, e.clientX, e.clientY);
    addNodeMapBox(app, ctx, wrap, Math.max(0, x - 55), Math.max(0, y - 16));
  });
}

// ── Fit boxes to their rendered text ──────────────────────────────────────

/** Sets a box's size on its rect and foreignObject. */
function sizeBox(ref: BoxRef): void {
  for (const el of [ref.rect, ref.fo]) {
    el.setAttribute("width", String(ref.box.width));
    el.setAttribute("height", String(ref.box.height));
  }
}

/**
 * Grows boxes whose rendered text doesn't fit the size measureBox() estimated
 * from character counts — a wider font (sketch mode's handwriting, a custom
 * one) wraps a name the estimate thought fit, and wrapped text overflows the
 * fixed height. A box widens (up to MAX_BOX_WIDTH) to keep its name on one
 * line, then grows to its content's height. Never shrinks, so it can't
 * oscillate. Returns true when any box changed. Skips boxes with no layout
 * (detached, collapsed, or a test DOM).
 */
function fitBoxesToContent(refs: BoxRef[]): boolean {
  let changed = false;
  for (const ref of refs) {
    const host = ref.fo.firstElementChild;
    if (!(host instanceof HTMLElement) || host.clientWidth === 0) continue;
    // Leave a box being edited alone until the edit ends.
    if (host.querySelector("[contenteditable]")) continue;
    const cs = getComputedStyle(host);
    const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);

    // The name's own one-line width: as a block it always spans the box, so
    // lay it out shrink-wrapped for the reading. (scrollWidth would report at
    // least the box's width and grow the box on every pass.)
    const { display, whiteSpace } = ref.nameEl.style;
    ref.nameEl.style.display = "inline-block";
    ref.nameEl.style.whiteSpace = "nowrap";
    const nameW = ref.nameEl.offsetWidth;
    ref.nameEl.style.display = display;
    ref.nameEl.style.whiteSpace = whiteSpace;
    const wantW = Math.min(MAX_BOX_WIDTH, Math.ceil(nameW + padX + 1));
    if (wantW > ref.box.width) { ref.box.width = wantW; sizeBox(ref); changed = true; }

    const wantH = Math.ceil(host.scrollHeight);
    if (wantH > ref.box.height + 1) { ref.box.height = wantH; sizeBox(ref); changed = true; }
  }
  return changed;
}

/** The SVG viewBox framing every box with PAD around it. */
function frameViewBox(svg: SVGSVGElement, boxes: MeasuredBox[]): void {
  let minX = 0, minY = 0, maxX = 0, maxY = 0;
  if (boxes.length > 0) {
    minX = Math.min(...boxes.map(b => b.x));
    minY = Math.min(...boxes.map(b => b.y));
    maxX = Math.max(...boxes.map(b => b.x + b.width));
    maxY = Math.max(...boxes.map(b => b.y + b.height));
  }
  const vbW = (maxX - minX) + PAD * 2, vbH = (maxY - minY) + PAD * 2;
  svg.setAttribute("viewBox", `${minX - PAD} ${minY - PAD} ${vbW} ${vbH}`);
  svg.setAttribute("width", String(vbW));
  svg.setAttribute("height", String(vbH));
}

// ── Public entry point ─────────────────────────────────────────────────────

export function renderNodeMap(
  data: NodeMapData,
  container: HTMLElement,
  rc: RenderContext = {},
): void {
  const { app, ctx, source } = rc;
  const isEditMode = !!(app && ctx && isEditModeActive(app));
  const defaultTitle = "Node Map";
  const title = source !== undefined ? parseTitle(source, defaultTitle) : defaultTitle;
  const onTitleEdit = (isEditMode && source !== undefined)
    ? (newTitle: string) => writeCanvasTitle(app!, ctx!, container, newTitle, defaultTitle)
    : undefined;
  initCanvas(container, "nodemap", title, undefined, source, onTitleEdit, app, ctx);

  const wrap = container.createEl("div", { cls: "vzd-nodemap-wrap" });

  const boxes: MeasuredBox[] = data.boxes.map(b => ({ ...b, ...measureBox(b) }));
  placeAutoBoxes(boxes);
  const boxByName = new Map<string, MeasuredBox>(boxes.map(b => [b.name.toLowerCase(), b]));

  const svg = createSvgEl("svg", { class: "vzd-nodemap-svg" }) as SVGSVGElement;
  frameViewBox(svg, boxes);

  renderMarkerDefs(svg);
  // Links get their own layer, under the boxes, so a drag can redraw them.
  const linksLayer = createSvgEl("g", { class: "vzd-nodemap-links" });
  svg.appendChild(linksLayer);
  renderLinks(linksLayer, data, boxByName, isEditMode, app, ctx, wrap);
  const refs = renderBoxes(svg, boxes);

  wrap.appendChild(svg);

  let placeHandle: (ref: BoxRef) => void = () => {};
  let placeControls: (ref: BoxRef) => void = () => {};
  /** Redraws what hangs off the given boxes after they move or resize. */
  const follow = (moved: BoxRef[]): void => {
    linksLayer.replaceChildren();
    renderLinks(linksLayer, data, boxByName, isEditMode, app, ctx, wrap);
    for (const ref of moved) { placeHandle(ref); placeControls(ref); }
  };

  if (isEditMode) {
    const ix: NodeMapIxState = { drag: null, linkDraw: null, activeEdit: null };
    placeHandle = attachLinkDrawBehavior(svg, refs, ix, app!, ctx!, wrap);
    attachEditBehavior(refs, ix, app!, ctx!, wrap);
    placeControls = attachBoxControls(refs, app!, ctx!, wrap);
    // Everything attached to a box follows it while it is dragged; the
    // document rewrite on drop re-renders from the new coordinates anyway.
    attachDragBehavior(svg, refs, ix, app!, ctx!, wrap, (ref) => follow([ref]));
    attachAddBoxOnEmptySpace(svg, ix, app!, ctx!, wrap);
  }

  // Fit boxes to their text once it is laid out, and again whenever it
  // changes size: a web font finishing loading, or sketch mode switching the
  // font on a canvas that is already rendered.
  const RO = (container.ownerDocument.defaultView ?? window).ResizeObserver;
  if (RO) {
    let pending = false;
    const ro = new RO(() => {
      if (pending) return;
      pending = true;
      (container.ownerDocument.defaultView ?? window).requestAnimationFrame(() => {
        pending = false;
        if (!fitBoxesToContent(refs)) return;
        follow(refs);
        frameViewBox(svg, boxes);
      });
    });
    for (const ref of refs) ro.observe(ref.fo.firstElementChild as Element);
    onDisconnected(wrap, () => ro.disconnect());
  }
}
