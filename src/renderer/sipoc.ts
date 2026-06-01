import type { App, MarkdownPostProcessorContext } from "obsidian";
import type { SIPOCData, SIPOCRow } from "../types";
import { t } from "../i18n";
import { initCanvas } from "./controls";
import { writeSIPOCCell } from "../shared/sipoc-edit";

type ColKey = keyof SIPOCRow;

function getCols(): { key: ColKey; label: string }[] {
  return [
    { key: "supplier", label: t("sipoc.col.suppliers") },
    { key: "input",    label: t("sipoc.col.inputs") },
    { key: "process",  label: t("sipoc.col.process") },
    { key: "output",   label: t("sipoc.col.outputs") },
    { key: "customer", label: t("sipoc.col.customers") },
  ];
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
  td.addClass("vzd-sipoc-editing");
  td.empty();

  const textarea = td.createEl("textarea", { cls: "vzd-sipoc-textarea" });
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
  initCanvas(container, "sipoc", "SIPOC Diagram", undefined, source);

  const wrap = container.createEl("div", { cls: "vzd-sipoc-wrap" });
  const table = wrap.createEl("table", { cls: "vzd-sipoc-table" });

  const thead = table.createEl("thead");
  const headerRow = thead.createEl("tr");

  getCols().forEach((col, i) => {
    const th = headerRow.createEl("th", {
      cls: `vzd-sipoc-th${col.key === "process" ? " vzd-sipoc-th--process" : ""}`,
      text: col.label,
    });
    if (i < getCols().length - 1) {
      const arrow = th.createEl("span", { cls: "vzd-sipoc-arrow", text: "→" });
      arrow.setAttribute("aria-hidden", "true");
    }
  });

  const tbody = table.createEl("tbody");

  data.rows.forEach((row, rowIdx) => {
    const tr = tbody.createEl("tr", {
      cls: rowIdx % 2 === 1 ? "vzd-sipoc-row vzd-sipoc-row--alt" : "vzd-sipoc-row",
    });

    getCols().forEach((col) => {
      const value = row[col.key];
      const td = tr.createEl("td", {
        cls: `vzd-sipoc-td${col.key === "process" ? " vzd-sipoc-td--process" : ""}`,
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
      }
    });
  });
}
