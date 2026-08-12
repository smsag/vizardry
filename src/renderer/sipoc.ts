import type { App, MarkdownPostProcessorContext } from "obsidian";
import type {
  SIPOCColumn, SIPOCData, SIPOCFlowLink, SIPOCFlowNode, SIPOCRow,
} from "../types";
import { t } from "../i18n";
import { initCanvas } from "./controls";
import { renderError } from "./canvas";
import { activateTextareaEdit } from "./inline-edit";
import { insertSIPOCRowAfter, writeSIPOCCell } from "../shared/sipoc-edit";
import { parseTitle, writeCanvasTitle } from "../shared/title-edit";
import { isEditModeActive } from "../shared/editor";
import { bestTextColor } from "../shared/color-utils";
import type { RenderContext } from "./render-context";
import type { FlowNode, FlowEdge, StageDef, FlowRole } from "../types/problem";
import { renderFlowGraph } from "./flow-graph";

export function renderSIPOC(
  data: SIPOCData,
  container: HTMLElement,
  rc: RenderContext = {},
): void {
  const { source, app, ctx } = rc;
  if (data.variant === "flow") {
    renderSIPOCFlowView(data, container, rc);
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
  // td padding is no longer zeroed in editing state, so the textarea sits
  // inside the padded cell. Subtract vertical padding from clientHeight so
  // the textarea's minHeight equals the inner content area, not the full cell.
  const tdStyle = getComputedStyle(td);
  const minHeight = Math.max(0,
    td.clientHeight - parseFloat(tdStyle.paddingTop) - parseFloat(tdStyle.paddingBottom)
  );
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
  const isEditMode = !!(app && ctx && isEditModeActive(app));
  const defaultTitle = "SIPOC Diagram";
  const title = source !== undefined ? parseTitle(source, defaultTitle) : defaultTitle;
  const onTitleEdit = (isEditMode && source !== undefined)
    ? (newTitle: string) => writeCanvasTitle(app!, ctx!, container, newTitle, defaultTitle)
    : undefined;
  initCanvas(container, "sipoc", title, undefined, source, onTitleEdit, app, ctx);

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

      if (isEditMode) {
        td.addClass("vzd-sipoc-td--editable");
        td.addEventListener("click", () => {
          activateCellEdit(td, col.key, rowIdx, value ?? "", app!, ctx!, container);
        });
      }
    });

    // Dedicated action cell — sits outside the data columns so the button is
    // never clipped by the table's overflow boundary.
    if (isEditMode) {
      const actionTd = tr.createEl("td", { cls: "vzd-sipoc-td vzd-sipoc-td--actions" });
      const btn = actionTd.createEl("button", {
        cls: "vzd-btn vzd-sipoc-add-row",
        attr: { "aria-label": t("sipoc.addRowBelow"), type: "button" },
      });
      btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
      btn.addEventListener("click", () => {
        insertSIPOCRowAfter(app!, ctx!, container, rowIdx);
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

// ── Flow view ────────────────────────────────────────────────────────────────
//
// The five SIPOC columns become the shared flow-graph's stages (Process is
// colour-highlighted via the `hi` role), each distinct cell value becomes a
// heading card, and `link:` directives become edges. `alignRows` lays the cards
// out on a uniform top-aligned grid so the columns line up row by row.

const FLOW_ROLE: Record<SIPOCColumn, FlowRole> = {
  suppliers: "neutral",
  inputs: "neutral",
  process: "hi",
  outputs: "neutral",
  customers: "neutral",
};

function renderSIPOCFlowView(data: SIPOCData, container: HTMLElement, rc: RenderContext): void {
  const { source, app, ctx } = rc;
  const defaultTitle = "SIPOC Flow Diagram";
  const title = source !== undefined ? parseTitle(source, defaultTitle) : defaultTitle;
  const onTitleEdit = (app && ctx && source !== undefined && isEditModeActive(app))
    ? (newTitle: string) => writeCanvasTitle(app, ctx, container, newTitle, defaultTitle)
    : undefined;
  initCanvas(container, "sipoc", title, undefined, source, onTitleEdit, app, ctx);

  const graph = deriveFlowGraph(data.rows, data.links);
  if ("error" in graph) {
    renderError(graph.error, container);
    return;
  }

  const labels = colLabels();
  const stages: StageDef[] = FLOW_COLS.map(col => ({ key: col, eyebrow: labels[col], role: FLOW_ROLE[col] }));
  const nodes: FlowNode[] = graph.nodes.map(n => ({ stage: n.column, id: n.id, heading: n.label }));
  const edges: FlowEdge[] = graph.links.map(l => ({ from: l.from, to: l.to }));

  const wrap = container.createEl("div", { cls: "vzd-flow-wrap" });
  renderFlowGraph(wrap, { stages, nodes, edges, alignRows: true }, rc);
}
