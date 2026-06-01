import type { App, MarkdownPostProcessorContext } from "obsidian";
import type { RACIData } from "../types";
import { t } from "../i18n";
import { initCanvas } from "./controls";
import { writeRACICell } from "../shared/raci-edit";

type CellKey = "task" | "responsible" | "accountable" | "consulted" | "informed";

function getCols(): { key: CellKey; label: string; accent?: boolean }[] {
  return [
    { key: "task",        label: t("raci.col.task") },
    { key: "responsible", label: t("raci.col.responsible"), accent: true },
    { key: "accountable", label: t("raci.col.accountable") },
    { key: "consulted",   label: t("raci.col.consulted") },
    { key: "informed",    label: t("raci.col.informed") },
  ];
}

function activateCellEdit(
  td: HTMLElement,
  cellKey: CellKey,
  rowIndex: number,
  currentValue: string,
  app: App,
  ctx: MarkdownPostProcessorContext,
  container: HTMLElement,
): void {
  if (td.hasClass("vzd-raci-editing")) return;
  td.addClass("vzd-raci-editing");
  td.empty();

  const textarea = td.createEl("textarea", { cls: "vzd-raci-textarea" });
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
    td.removeClass("vzd-raci-editing");
    td.empty();
    if (value) {
      td.createEl("span", { cls: "vzd-raci-cell-value", text: value });
    } else {
      td.createEl("span", { cls: "vzd-raci-cell-empty", text: "—" });
    }
  };

  const commit = (): void => {
    if (committed) return;
    committed = true;
    const newValue = textarea.value.trim();
    writeRACICell(app, ctx, container, rowIndex, cellKey, newValue);
    restoreCell(newValue);
  };

  textarea.addEventListener("blur", commit);
  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { committed = true; restoreCell(currentValue); }
    if (e.key === "Tab")    { e.preventDefault(); commit(); }
  });
}

export function renderRACIMatrix(
  data: RACIData,
  container: HTMLElement,
  source?: string,
  app?: App,
  ctx?: MarkdownPostProcessorContext,
): void {
  initCanvas(container, "raci", "RACI Matrix", undefined, source);

  const wrap = container.createEl("div", { cls: "vzd-raci-wrap" });
  const table = wrap.createEl("table", { cls: "vzd-raci-table" });

  // Header
  const thead = table.createEl("thead");
  const headerRow = thead.createEl("tr");
  getCols().forEach((col) => {
    headerRow.createEl("th", {
      cls: `vzd-raci-th${col.accent ? " vzd-raci-th--accent" : ""}`,
      text: col.label,
    });
  });

  // Body
  const tbody = table.createEl("tbody");
  data.rows.forEach((row, rowIdx) => {
    const tr = tbody.createEl("tr", {
      cls: rowIdx % 2 === 1 ? "vzd-raci-row vzd-raci-row--alt" : "vzd-raci-row",
    });

    getCols().forEach((col) => {
      const value = col.key === "task" ? row.task : row[col.key];
      const td = tr.createEl("td", {
        cls: `vzd-raci-td${col.accent ? " vzd-raci-td--accent" : ""}${col.key === "task" ? " vzd-raci-td--task" : ""}`,
      });

      if (value) {
        td.createEl("span", { cls: "vzd-raci-cell-value", text: value });
      } else {
        td.createEl("span", { cls: "vzd-raci-cell-empty", text: "—" });
      }

      if (app && ctx) {
        td.addClass("vzd-raci-td--editable");
        td.addEventListener("click", () => {
          activateCellEdit(td, col.key, rowIdx, value ?? "", app, ctx, container);
        });
      }
    });
  });
}
