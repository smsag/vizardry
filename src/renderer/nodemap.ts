import type { App, MarkdownPostProcessorContext } from "obsidian";
import type { NodeMapBox, NodeMapData, NodeMapColor } from "../types";
import type { RenderContext } from "./render-context";
import { initCanvas } from "./controls";
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
import { wireRenameInputKeys, createBlurGuard, activateTextareaEdit } from "./inline-edit";
import {
  writeNodeMapBoxPosition, addNodeMapBox, removeNodeMapBox, renameNodeMapBox,
  writeNodeMapBoxBody, setNodeMapBoxColor, addNodeMapLink, removeNodeMapLink,
} from "../shared/nodemap-edit";

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

interface MeasuredBox extends NodeMapBox {
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

type DragState = { ref: BoxRef };
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
  svg: SVGSVGElement,
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
      const deleteBtn = createSvgEl("g", { class: "vzd-nodemap-unlink-btn" });
      deleteBtn.appendChild(createSvgEl("circle", { cx: String(mx), cy: String(my), r: "8", class: "vzd-nodemap-unlink-circle" }));
      const xText = createSvgEl("text", {
        x: String(mx), y: String(my), class: "vzd-nodemap-unlink-icon",
        "text-anchor": "middle", "dominant-baseline": "central",
      });
      xText.textContent = "×";
      deleteBtn.appendChild(xText);
      deleteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        removeNodeMapLink(app, ctx, wrap, link.from, link.to);
      });
      linkG.appendChild(deleteBtn);
    }

    svg.appendChild(linkG);
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

function attachDragBehavior(
  svg: SVGSVGElement,
  refs: BoxRef[],
  ix: NodeMapIxState,
  app: App,
  ctx: MarkdownPostProcessorContext,
  wrap: HTMLElement,
): void {
  const doc = svg.ownerDocument;

  const moveBox = (ref: BoxRef, clientX: number, clientY: number): void => {
    const { x, y } = clientToSvg(svg, clientX, clientY);
    const nx = Math.max(0, x - ref.box.width / 2);
    const ny = Math.max(0, y - ref.box.height / 2);
    ref.rect.setAttribute("x", String(nx));
    ref.rect.setAttribute("y", String(ny));
    ref.fo.setAttribute("x", String(nx));
    ref.fo.setAttribute("y", String(ny));
  };

  const endDrag = (): void => {
    if (!ix.drag) return;
    const { ref } = ix.drag;
    ix.drag = null;
    ref.rect.classList.remove("vzd-nodemap-box--dragging");
    svg.classList.remove("vzd-nodemap-svg--dragging");
    const x = parseFloat(ref.rect.getAttribute("x") ?? "0");
    const y = parseFloat(ref.rect.getAttribute("y") ?? "0");
    writeNodeMapBoxPosition(app, ctx, wrap, ref.box.name, x, y);
    doc.removeEventListener("mousemove", onMouseMove);
    doc.removeEventListener("mouseup", onMouseUp);
  };

  const onMouseMove = (e: MouseEvent): void => { if (ix.drag) moveBox(ix.drag.ref, e.clientX, e.clientY); };
  const onMouseUp = (): void => endDrag();

  onDisconnected(wrap, () => {
    doc.removeEventListener("mousemove", onMouseMove);
    doc.removeEventListener("mouseup", onMouseUp);
    ix.drag = null;
  });

  for (const ref of refs) {
    ref.rect.classList.add("vzd-nodemap-box--draggable");
    const startDrag = (clientX: number, clientY: number): void => {
      if (ix.activeEdit || ix.linkDraw) return;
      ix.drag = { ref };
      ref.rect.classList.add("vzd-nodemap-box--dragging");
      svg.classList.add("vzd-nodemap-svg--dragging");
      doc.addEventListener("mousemove", onMouseMove);
      doc.addEventListener("mouseup", onMouseUp);
    };
    ref.rect.addEventListener("mousedown", (e) => { e.preventDefault(); e.stopPropagation(); startDrag(e.clientX, e.clientY); });
    ref.rect.addEventListener("touchstart", (e) => { e.preventDefault(); startDrag(e.touches[0].clientX, e.touches[0].clientY); }, { passive: false });
  }
}

// ── Interaction: "+" handle drag-to-connect two EXISTING boxes ────────────

function attachLinkDrawBehavior(
  svg: SVGSVGElement,
  refs: BoxRef[],
  ix: NodeMapIxState,
  data: NodeMapData,
  app: App,
  ctx: MarkdownPostProcessorContext,
  wrap: HTMLElement,
): void {
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

  for (const ref of refs) {
    const handle = createSvgEl("g", { class: "vzd-nodemap-add-handle-g" }) as SVGGElement;
    const cx = ref.box.x + ref.box.width + 10, cy = ref.box.y + ref.box.height / 2;
    handle.setAttribute("transform", `translate(${cx}, ${cy})`);
    handle.appendChild(createSvgEl("circle", { cx: "0", cy: "0", r: "13", class: "vzd-nodemap-add-handle-hit" }));
    handle.appendChild(createSvgEl("circle", { cx: "0", cy: "0", r: "7", class: "vzd-nodemap-add-handle" }));
    const plus = createSvgEl("text", { x: "0", y: "0.5", class: "vzd-nodemap-add-handle-icon", "text-anchor": "middle", "dominant-baseline": "middle" });
    plus.textContent = "+";
    handle.appendChild(plus);
    svg.appendChild(handle);
    handle.style.display = "none";

    ref.g.addEventListener("mouseenter", () => { if (!ix.drag && !ix.linkDraw && !ix.activeEdit) handle.style.display = ""; });
    ref.g.addEventListener("mouseleave", (e) => { if (e.relatedTarget !== handle && !(e.relatedTarget instanceof Node && handle.contains(e.relatedTarget))) handle.style.display = "none"; });
    handle.addEventListener("mouseleave", (e) => { if (e.relatedTarget !== ref.g && !(e.relatedTarget instanceof Node && ref.g.contains(e.relatedTarget))) handle.style.display = "none"; });

    handle.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (ix.activeEdit) return;
      const center = boxCenter(ref.box);
      const start = rectBoundary(center.x, center.y, ref.box.width / 2, ref.box.height / 2, cx, cy);
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
}

// ── Interaction: double-click to rename / edit body ───────────────────────

function attachEditBehavior(
  svg: SVGSVGElement,
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
      const host = ref.nameEl.parentElement!;
      ref.nameEl.style.display = "none";
      const input = document.createElement("input");
      input.type = "text";
      input.value = ref.box.name;
      input.className = "vzd-rename-input vzd-nodemap-rename-input";
      host.insertBefore(input, ref.nameEl);
      input.focus({ preventScroll: true });
      input.select();

      const blurGuard = createBlurGuard();
      const close = (): void => { blurGuard.dispose(); ix.activeEdit = null; };
      ix.activeEdit = { close };
      wireRenameInputKeys(input, (commit) => {
        close();
        input.remove();
        ref.nameEl.style.display = "";
        const newName = input.value.trim();
        if (commit && newName && newName !== ref.box.name) {
          renameNodeMapBox(app, ctx, wrap, ref.box.name, newName);
        }
      }, { stopPropagation: true, ignoreBlur: blurGuard.ignoreBlur });
    });

    const bodyHost = ref.fo.querySelector(".vzd-nodemap-box-body") as HTMLElement | null;
    if (bodyHost) {
      bodyHost.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        if (ix.drag || ix.linkDraw || ix.activeEdit) return;
        const host = ref.nameEl.parentElement!;
        ix.activeEdit = { close: () => { ix.activeEdit = null; } };
        activateTextareaEdit(host, bodyHost, ref.box.body ?? "", (newBody) => {
          writeNodeMapBoxBody(app, ctx, wrap, ref.box.name, newBody);
        }, {
          renderDisplay: (contentHost, value) => { contentHost.textContent = value; ix.activeEdit = null; },
        });
      });
    }
  }
}

// ── Interaction: delete box, color swatch, add box on empty space ────────

const NODEMAP_SWATCHES = ["red", "orange", "yellow", "green", "teal", "blue", "purple", "pink", "gray"] as const;

function closeColorPopover(wrap: HTMLElement): void {
  wrap.querySelector(".vzd-nodemap-color-popover")?.remove();
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
  const onDocClick = (e: MouseEvent): void => {
    if (e.target instanceof Node && popover.contains(e.target)) return;
    closeColorPopover(wrap);
    document.removeEventListener("mousedown", onDocClick, true);
  };
  document.addEventListener("mousedown", onDocClick, true);
}

function attachBoxControls(
  svg: SVGSVGElement,
  refs: BoxRef[],
  ix: NodeMapIxState,
  app: App,
  ctx: MarkdownPostProcessorContext,
  wrap: HTMLElement,
): void {
  for (const ref of refs) {
    const controls = createSvgEl("g", { class: "vzd-nodemap-box-controls" });
    const bx = ref.box.x + ref.box.width;
    const by = ref.box.y;

    const deleteBtn = createSvgEl("g", { class: "vzd-nodemap-box-delete-btn" });
    deleteBtn.setAttribute("transform", `translate(${bx - 10}, ${by + 10})`);
    deleteBtn.appendChild(createSvgEl("circle", { cx: "0", cy: "0", r: "8", class: "vzd-nodemap-unlink-circle" }));
    const xText = createSvgEl("text", { x: "0", y: "0", class: "vzd-nodemap-unlink-icon", "text-anchor": "middle", "dominant-baseline": "central" });
    xText.textContent = "×";
    deleteBtn.appendChild(xText);
    deleteBtn.addEventListener("click", (e) => { e.stopPropagation(); removeNodeMapBox(app, ctx, wrap, ref.box.name); });
    controls.appendChild(deleteBtn);

    const colorBtn = createSvgEl("g", { class: "vzd-nodemap-box-color-btn" });
    colorBtn.setAttribute("transform", `translate(${bx - 28}, ${by + 10})`);
    colorBtn.appendChild(createSvgEl("circle", { cx: "0", cy: "0", r: "8", class: "vzd-nodemap-color-btn-circle" }));
    colorBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openColorPopover(wrap, colorBtn, (color) => {
        setNodeMapBoxColor(app, ctx, wrap, ref.box.name, color as NodeMapColor | null);
      });
    });
    controls.appendChild(colorBtn);

    svg.appendChild(controls);
  }
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
  initCanvas(container, "nodemap", title, undefined, source, onTitleEdit, app);

  const wrap = container.createEl("div", { cls: "vzd-nodemap-wrap" });

  const boxes: MeasuredBox[] = data.boxes.map(b => ({ ...b, ...measureBox(b) }));
  const boxByName = new Map<string, MeasuredBox>(boxes.map(b => [b.name.toLowerCase(), b]));

  let minX = 0, minY = 0, maxX = 0, maxY = 0;
  if (boxes.length > 0) {
    minX = Math.min(...boxes.map(b => b.x));
    minY = Math.min(...boxes.map(b => b.y));
    maxX = Math.max(...boxes.map(b => b.x + b.width));
    maxY = Math.max(...boxes.map(b => b.y + b.height));
  }
  const vbX = minX - PAD, vbY = minY - PAD, vbW = (maxX - minX) + PAD * 2, vbH = (maxY - minY) + PAD * 2;

  const svg = createSvgEl("svg", {
    viewBox: `${vbX} ${vbY} ${vbW} ${vbH}`,
    width: String(vbW),
    height: String(vbH),
    class: "vzd-nodemap-svg",
  }) as SVGSVGElement;

  renderMarkerDefs(svg);
  renderLinks(svg, data, boxByName, isEditMode, app, ctx, wrap);
  const refs = renderBoxes(svg, boxes);

  wrap.appendChild(svg);

  if (isEditMode) {
    const ix: NodeMapIxState = { drag: null, linkDraw: null, activeEdit: null };
    attachDragBehavior(svg, refs, ix, app!, ctx!, wrap);
    attachLinkDrawBehavior(svg, refs, ix, data, app!, ctx!, wrap);
    attachEditBehavior(svg, refs, ix, app!, ctx!, wrap);
    attachBoxControls(svg, refs, ix, app!, ctx!, wrap);
    attachAddBoxOnEmptySpace(svg, ix, app!, ctx!, wrap);
  }
}
