import type { App, MarkdownPostProcessorContext } from "obsidian";
import type { SIPOCData, SIPOCRow } from "../types";
import { t } from "../i18n";
import { initCanvas } from "./controls";
import { insertSIPOCRowAfter, writeSIPOCCell } from "../shared/sipoc-edit";
import { parseTitle, writeCanvasTitle } from "../shared/title-edit";

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

function activateCellEdit(
  td: HTMLElement,
  cellKey: ColKey,
  rowIndex: number,
  currentValue: string,
  app: App,
  ctx: MarkdownPostProcessorContext,
  container: HTMLElement,
): void {
  if (td.hasClass("vzd-sipoc-editing")) return;
  const minH = td.clientHeight;
  td.addClass("vzd-sipoc-editing");
  td.empty();

  const textarea = td.createEl("textarea", { cls: "vzd-sipoc-textarea" });
  textarea.style.minHeight = `${minH}px`;
  textarea.value = currentValue;

  const resize = (): void => {
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  };
  resize();
  textarea.addEventListener("input", resize);
  textarea.focus();
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);

  let committed = false;

  const restoreCell = (value: string): void => {
    td.removeClass("vzd-sipoc-editing");
    td.empty();
    if (value) {
      td.createEl("span", { cls: "vzd-sipoc-cell-value", text: value });
    } else {
      td.createEl("span", { cls: "vzd-sipoc-cell-empty", text: "—" });
    }
  };

  const commit = (): void => {
    if (committed) return;
    committed = true;
    const newValue = textarea.value.trim();
    writeSIPOCCell(app, ctx, container, rowIndex, cellKey, newValue);
    restoreCell(newValue);
  };

  textarea.addEventListener("blur", commit);
  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { committed = true; restoreCell(currentValue); }
    if (e.key === "Tab")    { e.preventDefault(); commit(); }
  });
}

export function renderSIPOC(
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
  initCanvas(container, "sipoc", title, undefined, source, onTitleEdit);

  const wrap = container.createEl("div", { cls: "vzd-sipoc-wrap" });
  const table = wrap.createEl("table", { cls: "vzd-sipoc-table" });

  const thead = table.createEl("thead");
  const headerRow = thead.createEl("tr");

  getCols(data.rows).forEach((col, i) => {
    const th = headerRow.createEl("th", {
      cls: `vzd-sipoc-th${col.key === "process" ? " vzd-sipoc-th--process" : ""}`,
      text: col.label,
    });
    if (i < getCols(data.rows).length - 1) {
      const arrow = th.createEl("span", { cls: "vzd-sipoc-arrow", text: "→" });
      arrow.setAttribute("aria-hidden", "true");
    }
  });

  const tbody = table.createEl("tbody");

  const cols = getCols(data.rows);

  data.rows.forEach((row, rowIdx) => {
    const tr = tbody.createEl("tr", {
      cls: rowIdx % 2 === 1 ? "vzd-sipoc-row vzd-sipoc-row--alt" : "vzd-sipoc-row",
    });

    cols.forEach((col, colIdx) => {
      const value = row[col.key];
      const isLast = colIdx === cols.length - 1;
      const td = tr.createEl("td", {
        cls: `vzd-sipoc-td${col.key === "process" ? " vzd-sipoc-td--process" : ""}${isLast && app && ctx ? " vzd-sipoc-td--last" : ""}`,
      });

      if (value) {
        td.createEl("span", { cls: "vzd-sipoc-cell-value", text: value });
      } else {
        td.createEl("span", { cls: "vzd-sipoc-cell-empty", text: "—" });
      }

      if (app && ctx) {
        td.addClass("vzd-sipoc-td--editable");
        td.setAttribute("title", t("edit.clickToEdit"));
        td.addEventListener("click", () => {
          activateCellEdit(td, col.key, rowIdx, value ?? "", app, ctx, container);
        });

        if (isLast) {
          const btn = td.createEl("button", {
            cls: "vzd-sipoc-add-row vzd-btn",
            attr: { "aria-label": t("sipoc.addRowBelow"), type: "button" },
          });
          btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
          btn.addEventListener("click", (e) => {
            e.stopPropagation();
            insertSIPOCRowAfter(app, ctx, container, rowIdx);
          });
        }
      }
    });
  });
}
