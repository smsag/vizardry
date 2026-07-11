import type { App, MarkdownPostProcessorContext } from "obsidian";
import { MarkdownView } from "obsidian";
import type {
  SIPOCColumn, SIPOCData, SIPOCFlowLink, SIPOCFlowNode, SIPOCRow,
} from "../types";
import { t } from "../i18n";
import { initCanvas } from "./controls";
import { renderError } from "./canvas";
import { activateTextareaEdit } from "./inline-edit";
import { insertSIPOCRowAfter, writeSIPOCCell } from "../shared/sipoc-edit";
import { parseTitle, writeCanvasTitle } from "../shared/title-edit";
import { createSvgEl } from "../shared/svg";
import { SIPOC_FLOW_LABEL_MAX_CHARS } from "../shared/constants";
import { bestTextColor } from "../shared/color-utils";

export function renderSIPOC(
  data: SIPOCData,
  container: HTMLElement,
  source?: string,
  app?: App,
  ctx?: MarkdownPostProcessorContext,
): void {
  if (data.variant === "flow") {
    renderSIPOCFlowView(data, container, source, app, ctx);
  } else {
    renderSIPOCTable(data, container, source, app, ctx);
  }
}

// ── Table view ───────────────────────────────────────────────────────────────

type ColKey = keyof SIPOCRow;

const CORE_COLS: { key: ColKey; label: () => string }[] = [
  { key: "supplier", label: () => t("sipoc.col.suppliers") },
  { key: "input",    label: () => t("sipoc.col.inputs") },
  { key: "process",  label: () => t("sipoc.col.process") },
  { key: "output",   label: () => t("sipoc.col.outputs") },
  { key: "customer", label: () => t("sipoc.col.customers") },
];

const OPTIONAL_COLS: { key: ColKey; label: () => string }[] = [
  { key: "owner",  label: () => t("sipoc.col.owner") },
  { key: "metric", label: () => t("sipoc.col.metric") },
];

function getCols(rows: SIPOCData["rows"]): { key: ColKey; label: string }[] {
  const optional = OPTIONAL_COLS.filter(col => rows.some(r => r[col.key] !== ""));
  return [...CORE_COLS, ...optional].map(c => ({ key: c.key, label: c.label() }));
}

/** Maps a column key to its header accent-tier CSS class. Only Process is
 *  accent-tinted; the meta columns (owner, metric) get accent-coloured text
 *  on a neutral background; every other column stays on the plain default. */
function headerTierClass(key: ColKey): string {
  if (key === "owner" || key === "metric") return "vzd-sipoc-th--tier-meta";
  if (key === "process") return "vzd-sipoc-th--tier-hi";
  return "";
}

function activateCellEdit(
  td: HTMLElement,
  cellKey: ColKey,
  rowIndex: number,
  currentValue: string,
  app: App,
  ctx: MarkdownPostProcessorContext,
  container: HTMLElement,
): void {
  const minHeight = td.clientHeight;
  activateTextareaEdit(td, td, currentValue, (value) => {
    writeSIPOCCell(app, ctx, container, rowIndex, cellKey, value);
  }, {
    editingClass: "vzd-sipoc-editing",
    textareaClass: "vzd-sipoc-textarea",
    minHeight,
    renderDisplay: (host, value) => {
      host.empty();
      if (value) {
        host.createEl("span", { cls: "vzd-sipoc-cell-value", text: value });
      } else {
        host.createEl("span", { cls: "vzd-sipoc-cell-empty", text: "—" });
      }
    },
  });
}

function renderSIPOCTable(
  data: SIPOCData,
  container: HTMLElement,
  source?: string,
  app?: App,
  ctx?: MarkdownPostProcessorContext,
): void {
  const defaultTitle = "SIPOC Diagram";
  const title = source !== undefined ? parseTitle(source, defaultTitle) : defaultTitle;
  const onTitleEdit = (app && ctx && source !== undefined)
    ? (newTitle: string) => writeCanvasTitle(app, ctx, container, newTitle, defaultTitle)
    : undefined;
  initCanvas(container, "sipoc", title, undefined, source, onTitleEdit, app);

  // Read Mode still provides app/ctx (the post-processor runs there too), so
  // gate the edit affordance on the actual view mode — otherwise the hover
  // border/cursor and add-row button show in Read Mode even though clicking
  // there is a no-op.
  const isEditMode = !!(app && ctx) && app!.workspace.getActiveViewOfType(MarkdownView)?.getMode() !== "preview";

  const wrap = container.createEl("div", { cls: "vzd-sipoc-wrap" });
  const table = wrap.createEl("table", { cls: "vzd-sipoc-table" });

  const thead = table.createEl("thead");
  const headerRow = thead.createEl("tr");

  const allCols = getCols(data.rows);
  const headerEls: HTMLElement[] = [];
  allCols.forEach((col, i) => {
    const th = headerRow.createEl("th", {
      cls: `vzd-sipoc-th ${headerTierClass(col.key as ColKey)}`,
      text: col.label,
    });
    headerEls.push(th);
    // Arrows only mark the flow between the 5 core SIPOC columns — never
    // after Customer, and never on the optional owner/metric meta columns.
    if (i < CORE_COLS.length - 1) {
      const arrow = th.createEl("span", { cls: "vzd-sipoc-arrow", text: "→" });
      arrow.setAttribute("aria-hidden", "true");
    }
  });

  // Action column header — narrow spacer, only rendered in edit mode.
  if (isEditMode) {
    headerRow.createEl("th", { cls: "vzd-sipoc-th vzd-sipoc-th--actions" });
  }

  const tbody = table.createEl("tbody");

  const cols = getCols(data.rows);

  data.rows.forEach((row, rowIdx) => {
    const tr = tbody.createEl("tr", {
      cls: rowIdx % 2 === 1 ? "vzd-sipoc-row vzd-sipoc-row--alt" : "vzd-sipoc-row",
    });

    cols.forEach((col) => {
      const value = row[col.key];
      const td = tr.createEl("td", {
        cls: `vzd-sipoc-td${col.key === "process" ? " vzd-sipoc-td--process" : ""}`,
      });

      if (value) {
        td.createEl("span", { cls: "vzd-sipoc-cell-value", text: value });
      } else {
        td.createEl("span", { cls: "vzd-sipoc-cell-empty", text: "—" });
      }

      if (isEditMode && app && ctx) {
        td.addClass("vzd-sipoc-td--editable");
        td.addEventListener("click", () => {
          activateCellEdit(td, col.key, rowIdx, value ?? "", app, ctx, container);
        });
      }
    });

    // Dedicated action cell — sits outside the data columns so the button is
    // never clipped by the table's overflow boundary.
    if (isEditMode && app && ctx) {
      const actionTd = tr.createEl("td", { cls: "vzd-sipoc-td vzd-sipoc-td--actions" });
      const btn = actionTd.createEl("button", {
        cls: "vzd-btn vzd-sipoc-add-row",
        attr: { "aria-label": t("sipoc.addRowBelow"), type: "button" },
      });
      btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
      btn.addEventListener("click", () => {
        insertSIPOCRowAfter(app, ctx, container, rowIdx);
      });
    }
  });

  // Apply a contrast-checked text colour only to the accent-tinted Process
  // header. Meta columns (owner, metric) use a fixed accent colour; every
  // other column has no tint and keeps the base --text-normal colour.
  for (const th of headerEls) {
    if (th.hasClass("vzd-sipoc-th--tier-meta")) {
      th.style.color = "var(--interactive-accent)";
    } else if (th.hasClass("vzd-sipoc-th--tier-hi")) {
      th.style.color = bestTextColor(th);
    }
  }
}

// ── Flow view ────────────────────────────────────────────────────────────────
//
// Nodes are never declared directly — they're derived from `rows` (see
// deriveFlowGraph below): one node per distinct non-empty cell value within
// each of the 5 core columns, in first-occurrence row order. Identical text
// in the same column across different rows collapses into a single shared
// node. Owner/Metric never produce nodes — they stay table-only.

const FLOW_COLS: SIPOCColumn[] = ["suppliers", "inputs", "process", "outputs", "customers"];

/** Maps each SIPOCRow cell key to the flow column it derives nodes for. */
const CORE_COL_ORDER: { rowKey: Exclude<ColKey, "owner" | "metric">; flowCol: SIPOCColumn }[] = [
  { rowKey: "supplier", flowCol: "suppliers" },
  { rowKey: "input",    flowCol: "inputs" },
  { rowKey: "process",  flowCol: "process" },
  { rowKey: "output",   flowCol: "outputs" },
  { rowKey: "customer", flowCol: "customers" },
];

function normalise(label: string): string {
  return label.toLowerCase().trim();
}

interface DerivedFlowGraph {
  nodes: SIPOCFlowNode[];
  links: SIPOCFlowLink[];
}

/**
 * Builds the flow diagram's node/link graph from table rows plus the raw
 * `link:` directives. This is where link-target validation lives (not the
 * parser — see the doc comment on SIPOCData in types.ts) so a link left
 * dangling by a row edit only ever surfaces here, in flow view.
 */
function deriveFlowGraph(rows: SIPOCRow[], rawLinks: SIPOCFlowLink[]): DerivedFlowGraph | { error: string } {
  const nodes: SIPOCFlowNode[] = [];
  const byId = new Map<string, SIPOCFlowNode[]>();

  for (const { rowKey, flowCol } of CORE_COL_ORDER) {
    const seen = new Set<string>();
    for (const row of rows) {
      const label = row[rowKey].trim();
      if (!label) continue;
      const id = normalise(label);
      if (seen.has(id)) continue;
      seen.add(id);

      const node: SIPOCFlowNode = { id, label, column: flowCol };
      nodes.push(node);
      const bucket = byId.get(id) ?? [];
      bucket.push(node);
      byId.set(id, bucket);
    }
  }

  const links: SIPOCFlowLink[] = [];
  for (const raw of rawLinks) {
    const resolve = (text: string): SIPOCFlowNode | { error: string } => {
      const matches = byId.get(normalise(text)) ?? [];
      if (matches.length === 0) return { error: `link references unknown node "${text}"` };
      if (matches.length > 1) {
        const cols = matches.map(n => n.column).join(", ");
        return { error: `link reference "${text}" is ambiguous — it appears in more than one column (${cols})` };
      }
      return matches[0];
    };

    const from = resolve(raw.from);
    if ("error" in from) return from;
    const to = resolve(raw.to);
    if ("error" in to) return to;

    links.push({ from: from.id, to: to.id });
  }

  return { nodes, links };
}

// ── Layout constants ───────────────────────────────────────────────────────

function colLabels(): Record<SIPOCColumn, string> {
  return {
    suppliers: t("sipoc.col.suppliers"),
    inputs:    t("sipoc.col.inputs"),
    process:   t("sipoc.col.process"),
    outputs:   t("sipoc.col.outputs"),
    customers: t("sipoc.col.customers"),
  };
}

const W = 900;
const HEADER_H = 44;
const PAD = { top: 16, right: 0, bottom: 20, left: 0 };
const COL_W = (W - PAD.left - PAD.right) / FLOW_COLS.length; // 180
const ROW_H = 68;
const NODE_W = 120;
const NODE_H = 36;
const MARKER_ID = "vzd-sipoc-flow-arrow";

// ── Geometry helpers ───────────────────────────────────────────────────────

function colCx(colIdx: number): number {
  return PAD.left + (colIdx + 0.5) * COL_W;
}

function nodeY(idx: number, count: number, plotH: number): number {
  return HEADER_H + PAD.top + (plotH * (idx + 0.5)) / count;
}

/** Right-edge connection point of a node (for outgoing arrows). */
function rightPort(cx: number, cy: number): { x: number; y: number } {
  return { x: cx + NODE_W / 2, y: cy };
}

/** Left-edge connection point of a node (for incoming arrows). */
function leftPort(cx: number, cy: number): { x: number; y: number } {
  return { x: cx - NODE_W / 2, y: cy };
}

/** Bottom-centre connection point (for downward same-column arrows). */
function bottomPort(cx: number, cy: number): { x: number; y: number } {
  return { x: cx, y: cy + NODE_H / 2 };
}

/** Top-centre connection point (for upward same-column arrows). */
function topPort(cx: number, cy: number): { x: number; y: number } {
  return { x: cx, y: cy - NODE_H / 2 };
}

// ── Node drawing ─────────────────────────────────────────────────────────────
//
// Every derived node draws as a plain rounded rect — there's no source syntax
// left to request a different shape (the unified parser dropped the old
// freeform `Name [shape]` declarations in favour of deriving nodes from table
// rows). Reintroducing shape variety would mean adding a per-cell shape
// override syntax first; until then, the other 9 shapes SIPOC-flow used to
// support would just be dead, untestable code.

function drawNode(svg: SVGElement, cx: number, cy: number, label: string, isAnchor: boolean): void {
  const cls = `vzd-sf-node${isAnchor ? " vzd-sf-node--accent" : ""}`;

  svg.appendChild(createSvgEl("rect", {
    x: String(cx - NODE_W / 2), y: String(cy - NODE_H / 2),
    width: String(NODE_W), height: String(NODE_H),
    rx: "4",
    class: cls,
  }));

  // Label — truncate long text
  const displayLabel = label.length > SIPOC_FLOW_LABEL_MAX_CHARS ? label.slice(0, SIPOC_FLOW_LABEL_MAX_CHARS - 1) + "…" : label;
  const text = createSvgEl("text", {
    x: String(cx), y: String(cy),
    class: "vzd-sf-label",
    "text-anchor": "middle",
    "dominant-baseline": "central",
  });
  text.textContent = displayLabel;

  // title tooltip for full label when truncated
  if (label.length > SIPOC_FLOW_LABEL_MAX_CHARS) {
    const title = createSvgEl("title");
    title.textContent = label;
    text.appendChild(title);
  }

  svg.appendChild(text);
}

// ── Arrow routing ──────────────────────────────────────────────────────────

/**
 * Draws a cubic-bezier arrow from (x1,y1) to (x2,y2).
 *
 * Horizontal mode (cross-column): control points pull along the x-axis.
 * Vertical mode (same-column): control points pull along the y-axis so the
 * curve reads as a clean downward/upward arc within the column band.
 */
function drawArrow(
  svg: SVGElement,
  x1: number, y1: number,
  x2: number, y2: number,
  direction: "right" | "left" | "vertical",
): void {
  let d: string;

  if (direction === "vertical") {
    const tension = Math.max(Math.abs(y2 - y1) * 0.45, 20);
    const goingDown = y2 >= y1;
    const cp1y = goingDown ? y1 + tension : y1 - tension;
    const cp2y = goingDown ? y2 - tension : y2 + tension;
    d = `M${x1},${y1} C${x1},${cp1y} ${x2},${cp2y} ${x2},${y2}`;
  } else {
    const tension = Math.abs(x2 - x1) * 0.45;
    const cp1x = direction === "right" ? x1 + tension : x1 - tension;
    const cp2x = direction === "right" ? x2 - tension : x2 + tension;
    d = `M${x1},${y1} C${cp1x},${y1} ${cp2x},${y2} ${x2},${y2}`;
  }

  const path = createSvgEl("path", {
    d,
    class: "vzd-sf-link",
    "marker-end": `url(#${MARKER_ID})`,
  });
  svg.appendChild(path);
}

// ── Main flow renderer ───────────────────────────────────────────────────────

function renderSIPOCFlowView(
  data: SIPOCData,
  container: HTMLElement,
  source?: string,
  app?: App,
  ctx?: MarkdownPostProcessorContext,
): void {
  const defaultTitle = "SIPOC Flow Diagram";
  const title = source !== undefined ? parseTitle(source, defaultTitle) : defaultTitle;
  const onTitleEdit = (app && ctx && source !== undefined)
    ? (newTitle: string) => writeCanvasTitle(app, ctx, container, newTitle, defaultTitle)
    : undefined;
  initCanvas(container, "sipoc", title, undefined, source, onTitleEdit, app);

  const graph = deriveFlowGraph(data.rows, data.links);
  if ("error" in graph) {
    renderError(graph.error, container);
    return;
  }

  const wrap = container.createEl("div", { cls: "vzd-sipoc-flow-wrap" });

  // Determine height from the tallest column
  const colCounts = FLOW_COLS.map(col => graph.nodes.filter(n => n.column === col).length);
  const maxNodes = Math.max(...colCounts, 1);
  const plotH = maxNodes * ROW_H;
  const H = HEADER_H + PAD.top + plotH + PAD.bottom;

  const svg = createSvgEl("svg", {
    viewBox: `0 0 ${W} ${H}`,
    class: "vzd-sipoc-flow-svg",
  });

  // ── Defs: arrowhead marker ─────────────────────────────────────────────
  const defs = createSvgEl("defs");
  const marker = createSvgEl("marker", {
    id: MARKER_ID,
    markerWidth: "8", markerHeight: "8",
    refX: "7", refY: "3",
    orient: "auto",
  });
  const mPath = createSvgEl("path", { d: "M0,0 L0,6 L8,3 z", class: "vzd-sf-arrowhead" });
  marker.appendChild(mPath);
  defs.appendChild(marker);
  svg.appendChild(defs);

  // ── Column bands and headers ───────────────────────────────────────────
  // Collect rect+text pairs so we can set contrast-checked text colours after
  // the SVG is attached to the DOM (required for getComputedStyle to resolve
  // color-mix() values in the header fill).
  const headerPairs: Array<{ rect: Element; text: HTMLElement }> = [];

  FLOW_COLS.forEach((col, i) => {
    const x = PAD.left + i * COL_W;

    const band = createSvgEl("rect", {
      x: String(x), y: "0",
      width: String(COL_W), height: String(H),
      class: `vzd-sf-band vzd-sf-band--${col}`,
    });
    svg.appendChild(band);

    const divider = createSvgEl("line", {
      x1: String(x), y1: "0",
      x2: String(x), y2: String(H),
      class: "vzd-sf-divider",
    });
    svg.appendChild(divider);

    const headerRect = createSvgEl("rect", {
      x: String(x), y: "0",
      width: String(COL_W), height: String(HEADER_H),
      class: `vzd-sf-header vzd-sf-header--${col}`,
    });
    svg.appendChild(headerRect);

    const headerText = createSvgEl("text", {
      x: String(x + COL_W / 2), y: String(HEADER_H / 2),
      class: "vzd-sf-header-label",
      "text-anchor": "middle",
      "dominant-baseline": "central",
    });
    headerText.textContent = colLabels()[col];
    svg.appendChild(headerText);

    headerPairs.push({ rect: headerRect, text: headerText as unknown as HTMLElement });
  });

  // ── Build position map ─────────────────────────────────────────────────
  // Map nodeId → {cx, cy} for link drawing
  const posMap = new Map<string, { cx: number; cy: number }>();

  FLOW_COLS.forEach((col, colIdx) => {
    const colNodes = graph.nodes.filter(n => n.column === col);
    const cx = colCx(colIdx);
    colNodes.forEach((node, idx) => {
      const cy = nodeY(idx, Math.max(colNodes.length, 1), plotH);
      posMap.set(node.id, { cx, cy });
    });
  });

  // ── Draw links (behind nodes) ──────────────────────────────────────────
  const colIndex = Object.fromEntries(FLOW_COLS.map((c, i) => [c, i])) as Record<SIPOCColumn, number>;

  for (const link of graph.links) {
    const from = posMap.get(link.from);
    const to = posMap.get(link.to);
    if (!from || !to) continue;

    const fromNode = graph.nodes.find(n => n.id === link.from)!;
    const toNode = graph.nodes.find(n => n.id === link.to)!;

    let src: { x: number; y: number };
    let dst: { x: number; y: number };
    let direction: "right" | "left" | "vertical";

    if (fromNode.column === toNode.column) {
      const goingDown = from.cy <= to.cy;
      src = goingDown ? bottomPort(from.cx, from.cy) : topPort(from.cx, from.cy);
      dst = goingDown ? topPort(to.cx, to.cy)        : bottomPort(to.cx, to.cy);
      direction = "vertical";
    } else {
      const goingRight = colIndex[fromNode.column] < colIndex[toNode.column];
      src = goingRight ? rightPort(from.cx, from.cy) : leftPort(from.cx, from.cy);
      dst = goingRight ? leftPort(to.cx, to.cy)       : rightPort(to.cx, to.cy);
      direction = goingRight ? "right" : "left";
    }

    drawArrow(svg, src.x, src.y, dst.x, dst.y, direction);
  }

  // ── Draw nodes (on top of links) ──────────────────────────────────────
  for (const node of graph.nodes) {
    const pos = posMap.get(node.id)!;
    const isAccent = node.column === "process";
    drawNode(svg, pos.cx, pos.cy, node.label, isAccent);
  }

  wrap.appendChild(svg);

  // Apply contrast-checked text colours now that color-mix() has been resolved.
  for (const { rect, text } of headerPairs) {
    text.style.fill = bestTextColor(rect, true);
  }
}
