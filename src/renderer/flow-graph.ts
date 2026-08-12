/**
 * Shared flow-graph renderer: a left-to-right sequence of stage columns holding
 * cards (eyebrow + heading + optional body) connected by bezier link edges.
 *
 * Two canvases drive it:
 *   - Problem statement (`alignRows: false`) — each column stacks its cards with
 *     their natural heights.
 *   - SIPOC flow (`alignRows: true`) — every card uses a uniform row height and
 *     card k of each column shares row k's y, so the columns line up as a tidy
 *     grid. A stage's `hi` role (e.g. SIPOC's Process) is colour-highlighted.
 *
 * Cards are HTML in an SVG `foreignObject`, so a card heading can carry a
 * same-note chapter link (renderHeadingLink) exactly like other card canvases.
 */
import type { FlowEdge, FlowNode, StageDef } from "../types/problem";
import type { RenderContext } from "./render-context";
import { renderHeadingLink } from "./controls";
import { createSvgEl } from "../shared/svg";
import { estimateCharsPerLine, wrappedLineCount } from "../shared/svg-box";
import { rectBoundary } from "../shared/geometry";

// ── Layout constants (SVG user units) ────────────────────────────────────────
const PAD = 24;
const CARD_W = 208;
const COL_GAP = 72;
const CARD_GAP = 18;
const CARD_PAD_X = 13;
const CARD_PAD_TOP = 11;
const CARD_PAD_BOTTOM = 13;
const EYEBROW_H = 15;
const HEADING_LINE_H = 20;
const BODY_LINE_H = 18;
const HEADING_BODY_GAP = 5;
const CHAR_W = 7;
const MARKER_ID = "vzd-flow-arrow";

/** Live-edit hooks. Present only when the canvas is editable (Problem in Live
 *  Preview); SIPOC flow omits them and stays read-only. */
export interface FlowEdit {
  /** Persist an edited card (both fields; the caller writes `heading | body`). */
  editText: (node: FlowNode, heading: string, body: string) => void;
  /** Delete a card. */
  deleteCard: (node: FlowNode) => void;
  /** Append a new card to a stage's column. */
  addCard: (stageKey: string) => void;
}

export interface FlowSpec {
  stages: StageDef[];
  nodes: FlowNode[];
  edges: FlowEdge[];
  /** Uniform row height + shared row grid across columns (SIPOC). Default false
   *  (Problem): each column stacks its cards with their own heights. */
  alignRows?: boolean;
  edit?: FlowEdit;
}

interface Placed extends FlowNode {
  role: StageDef["role"];
  eyebrow: string;
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

/** Assigns each node an (x, y, w, h). Empty stages are skipped so columns don't
 *  gap; present stages keep arc order left→right. */
function layout(spec: FlowSpec): { placed: Placed[]; width: number; height: number } {
  const { stages, nodes, alignRows } = spec;
  const roleByStage = new Map(stages.map(s => [s.key, s.role]));
  const eyebrowByStage = new Map(stages.map(s => [s.key, s.eyebrow]));
  const presentStages = stages.filter(s => nodes.some(n => n.stage === s.key));
  const colNodes = presentStages.map(s => nodes.filter(n => n.stage === s.key));

  const place = (node: FlowNode, x: number, y: number, h: number): Placed => ({
    ...node,
    role: roleByStage.get(node.stage) ?? "neutral",
    eyebrow: eyebrowByStage.get(node.stage) ?? "",
    x, y, w: CARD_W, h,
  });

  const placed: Placed[] = [];
  let maxBottom = PAD;

  if (alignRows) {
    // Uniform row height so card k of every column shares row k's y.
    const rowH = Math.max(1, ...nodes.map(cardHeight));
    presentStages.forEach((stage, colIdx) => {
      const x = PAD + colIdx * (CARD_W + COL_GAP);
      colNodes[colIdx].forEach((node, k) => {
        const y = PAD + k * (rowH + CARD_GAP);
        placed.push(place(node, x, y, rowH));
        maxBottom = Math.max(maxBottom, y + rowH);
      });
    });
  } else {
    presentStages.forEach((stage, colIdx) => {
      const x = PAD + colIdx * (CARD_W + COL_GAP);
      let y = PAD;
      for (const node of colNodes[colIdx]) {
        const h = cardHeight(node);
        placed.push(place(node, x, y, h));
        y += h + CARD_GAP;
      }
      maxBottom = Math.max(maxBottom, y - CARD_GAP);
    });
  }

  const width = PAD * 2 + presentStages.length * CARD_W + Math.max(0, presentStages.length - 1) * COL_GAP;
  return { placed, width, height: maxBottom + PAD };
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

/** Cubic-bezier arrow between two card edges, curving along whichever axis
 *  dominates (cross-column reads horizontal, same-column reads vertical). */
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

/**
 * Makes `el` editable *in place* — the element itself becomes contenteditable
 * (no swapped-in textarea, no border, no reflow on entry), mirroring the canvas
 * title editor. Commits on Enter/blur, cancels on Escape.
 */
function makeEditable(el: HTMLElement, initial: string, commit: (value: string) => void): void {
  el.classList.add("vzd-flow-editable");
  el.addEventListener("click", (e) => {
    e.stopPropagation();
    if (el.getAttribute("contenteditable")) return;
    el.setAttribute("contenteditable", "plaintext-only");
    el.setAttribute("spellcheck", "false");
    el.focus();

    const doc = el.ownerDocument;
    const range = doc.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = (doc.defaultView ?? window).getSelection?.();
    sel?.removeAllRanges();
    sel?.addRange(range);

    const finish = (save: boolean): void => {
      el.removeEventListener("keydown", onKey);
      el.removeAttribute("contenteditable");
      el.removeAttribute("spellcheck");
      const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
      if (save && text !== initial) { el.textContent = text; commit(text); }
      else el.textContent = initial;
    };
    const onKey = (ev: KeyboardEvent): void => {
      if (ev.key === "Enter") { ev.preventDefault(); finish(true); }
      else if (ev.key === "Escape") { ev.preventDefault(); finish(false); }
    };
    el.addEventListener("keydown", onKey);
    el.addEventListener("blur", () => finish(true), { once: true });
  });
}

function renderCard(svg: SVGElement, node: Placed, rc: RenderContext, edit?: FlowEdit): void {
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
  if (node.eyebrow) host.createEl("div", { cls: "vzd-flow-eyebrow", text: node.eyebrow });

  if (edit) {
    // Editable in place: heading + body always present so an empty field can be
    // filled; placeholders come from CSS (:empty::before).
    const headEl = host.createEl("div", { cls: "vzd-flow-heading vzd-flow-heading--edit", text: node.heading });
    makeEditable(headEl, node.heading, (h) => edit.editText(node, h, node.body ?? ""));
    const bodyEl = host.createEl("div", { cls: "vzd-flow-body vzd-flow-body--edit", text: node.body ?? "" });
    makeEditable(bodyEl, node.body ?? "", (b) => edit.editText(node, node.heading, b));

    const del = host.createEl("button", {
      cls: "vzd-flow-card-delete", attr: { "aria-label": "Delete card", type: "button" },
    });
    del.textContent = "×";
    del.addEventListener("click", (e) => { e.stopPropagation(); edit.deleteCard(node); });
  } else {
    if (node.heading) {
      const headEl = host.createEl("div", { cls: "vzd-flow-heading", text: node.heading });
      renderHeadingLink(headEl, node.heading, rc.resolver, rc.navigateTo, rc.app, rc.ctx?.sourcePath);
    }
    if (node.body) host.createEl("div", { cls: "vzd-flow-body", text: node.body });
  }

  fo.appendChild(host);
  g.appendChild(fo);
}

/** A "+ Add" affordance below each present column (edit mode only). */
function renderAddButtons(svg: SVGElement, placed: Placed[], spec: FlowSpec): void {
  const byStage = new Map<string, { x: number; bottom: number }>();
  for (const p of placed) {
    const cur = byStage.get(p.stage);
    const bottom = p.y + p.h;
    if (!cur) byStage.set(p.stage, { x: p.x, bottom });
    else cur.bottom = Math.max(cur.bottom, bottom);
  }
  for (const stage of spec.stages) {
    const col = byStage.get(stage.key);
    if (!col) continue;
    const fo = createSvgEl("foreignObject", {
      x: String(col.x), y: String(col.bottom + 8), width: String(CARD_W), height: "26",
    });
    const btn = document.createElement("button");
    btn.className = "vzd-flow-add";
    btn.type = "button";
    btn.setAttribute("aria-label", `Add ${stage.eyebrow} card`);
    btn.textContent = "+ Add";
    btn.addEventListener("click", (e) => { e.stopPropagation(); spec.edit!.addCard(stage.key); });
    fo.appendChild(btn);
    svg.appendChild(fo);
  }
}

/** Builds the flow SVG (marker + edges under cards) into `wrap`. */
export function renderFlowGraph(wrap: HTMLElement, spec: FlowSpec, rc: RenderContext): void {
  const { placed, width, height } = layout(spec);
  const byId = new Map(placed.map(p => [p.id, p]));
  // Reserve a row under the columns for the per-column "+ Add" affordances.
  const h = height + (spec.edit ? 36 : 0);

  const svg = createSvgEl("svg", {
    viewBox: `0 0 ${width} ${h}`,
    width: String(width),
    height: String(h),
    class: "vzd-flow-svg",
  });
  renderMarker(svg);
  for (const edge of spec.edges) {
    const from = byId.get(edge.from), to = byId.get(edge.to);
    if (from && to) drawEdge(svg, from, to);
  }
  for (const node of placed) renderCard(svg, node, rc, spec.edit);
  if (spec.edit) renderAddButtons(svg, placed, spec);
  wrap.appendChild(svg);
}
