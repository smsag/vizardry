import { SIPOCData } from "../types";
import { initCanvas } from "./controls";

type ColKey = "suppliers" | "inputs" | "process" | "outputs" | "customers";

const COLS: { key: ColKey; label: string }[] = [
  { key: "suppliers", label: "Suppliers" },
  { key: "inputs",    label: "Inputs" },
  { key: "process",   label: "Process" },
  { key: "outputs",   label: "Outputs" },
  { key: "customers", label: "Customers" },
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
  const bodyRow = tbody.createEl("tr");

  COLS.forEach((col) => {
    const td = bodyRow.createEl("td", {
      cls: `vzd-sipoc-td${col.key === "process" ? " vzd-sipoc-td--process" : ""}`,
    });

    const isProcess = col.key === "process";
    let list: HTMLElement;
    if (isProcess) {
      list = td.createEl("ol", { cls: "vzd-sipoc-list vzd-sipoc-list--numbered" });
    } else {
      list = td.createEl("ul", { cls: "vzd-sipoc-list" });
    }

    const items = data[col.key];
    if (items.length === 0) {
      list.createEl("li", { cls: "vzd-sipoc-item vzd-sipoc-item--empty", text: "—" });
    } else {
      items.forEach(item => list.createEl("li", { cls: "vzd-sipoc-item", text: item }));
    }
  });
}
