import type { SIPOCData, SIPOCRow } from "../types";
import { initCanvas } from "./controls";

type ColKey = keyof SIPOCRow;

const COLS: { key: ColKey; label: string }[] = [
  { key: "supplier", label: "Suppliers" },
  { key: "input",    label: "Inputs" },
  { key: "process",  label: "Process" },
  { key: "output",   label: "Outputs" },
  { key: "customer", label: "Customers" },
];

export function renderSIPOC(data: SIPOCData, container: HTMLElement): void {
  initCanvas(container, "sipoc", "SIPOC Diagram");

  const wrap = container.createEl("div", { cls: "vzd-sipoc-wrap" });
  const table = wrap.createEl("table", { cls: "vzd-sipoc-table" });

  const thead = table.createEl("thead");
  const headerRow = thead.createEl("tr");

  COLS.forEach((col, i) => {
    const th = headerRow.createEl("th", {
      cls: `vzd-sipoc-th${col.key === "process" ? " vzd-sipoc-th--process" : ""}`,
      text: col.label,
    });
    if (i < COLS.length - 1) {
      const arrow = th.createEl("span", { cls: "vzd-sipoc-arrow", text: "→" });
      arrow.setAttribute("aria-hidden", "true");
    }
  });

  const tbody = table.createEl("tbody");

  data.rows.forEach((row, rowIdx) => {
    const tr = tbody.createEl("tr", {
      cls: rowIdx % 2 === 1 ? "vzd-sipoc-row vzd-sipoc-row--alt" : "vzd-sipoc-row",
    });

    COLS.forEach((col) => {
      const value = row[col.key];
      const td = tr.createEl("td", {
        cls: `vzd-sipoc-td${col.key === "process" ? " vzd-sipoc-td--process" : ""}`,
      });

      if (value) {
        td.createEl("span", { cls: "vzd-sipoc-cell-value", text: value });
      } else {
        td.createEl("span", { cls: "vzd-sipoc-cell-empty", text: "—" });
      }
    });
  });
}
