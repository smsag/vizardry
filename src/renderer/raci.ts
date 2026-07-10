import type { App, MarkdownPostProcessorContext } from "obsidian";
import type { RACIData } from "../types";
import { t } from "../i18n";
import { initCanvas } from "./controls";
import { activateTextareaEdit } from "./inline-edit";
import { writeRACICell } from "../shared/raci-edit";
import { parseTitle, writeCanvasTitle } from "../shared/title-edit";
import { isEditModeActive } from "../shared/editor";

type CellKey = "task" | "responsible" | "accountable" | "consulted" | "informed";

/** Definition shown as placeholder when a column has no data. */
const RACI_DEFINITIONS: Record<CellKey, string> = {
  task:        "Name of the activity or deliverable",
  responsible: "Who does the work",
  accountable: "Who owns the outcome — one person per task",
  consulted:   "Whose input is needed before deciding",
  informed:    "Who is kept in the loop but not involved",
};

function getCols(): { key: CellKey; label: string; accent?: boolean }[] {
  return [
    { key: "task",        label: t("raci.col.task") },
    { key: "responsible", label: t("raci.col.responsible"), accent: true },
    { key: "accountable", label: t("raci.col.accountable") },
    { key: "consulted",   label: t("raci.col.consulted") },
    { key: "informed",    label: t("raci.col.informed") },
  ];
}

function activateItemEdit(
  item: HTMLElement,
  cellKey: CellKey,
  rowIndex: number,
  currentValue: string,
  app: App,
  ctx: MarkdownPostProcessorContext,
  container: HTMLElement,
): void {
  activateTextareaEdit(item, item, currentValue, (value) => {
    writeRACICell(app, ctx, container, rowIndex, cellKey, value);
  }, {
    editingClass: "vzd-raci-editing",
    textareaClass: "vzd-raci-textarea",
    renderDisplay: (host, value) => {
      host.empty();
      if (value) {
        host.removeClass("vzd-raci-item--empty");
        host.createEl("span", { cls: "vzd-raci-item-value", text: value });
      } else {
        host.addClass("vzd-raci-item--empty");
      }
    },
  });
}

export function renderRACIMatrix(
  data: RACIData,
  container: HTMLElement,
  source?: string,
  app?: App,
  ctx?: MarkdownPostProcessorContext,
): void {
  const isEditMode = !!(app && ctx && isEditModeActive(app));
  const defaultTitle = "RACI Matrix";
  const title = source !== undefined ? parseTitle(source, defaultTitle) : defaultTitle;
  const onTitleEdit = (isEditMode && source !== undefined)
    ? (newTitle: string) => writeCanvasTitle(app!, ctx!, container, newTitle, defaultTitle)
    : undefined;
  initCanvas(container, "raci", title, undefined, source, onTitleEdit, app);

  const rows = data?.rows ?? [];

  // Use the same grid structure as all other canvases
  const grid = container.createEl("div", { cls: "vizardry-grid" });
  grid.style.setProperty("--vzd-template", '"task responsible accountable consulted informed"');
  grid.style.setProperty("--vzd-columns", "repeat(5, 1fr)");
  grid.style.setProperty("--vzd-rows", "1fr");

  getCols().forEach((col) => {
    // Use vizardry-block so the design is identical to all other canvases
    const block = grid.createEl("div", {
      cls: `vizardry-block${col.accent ? " vzd-raci-col--accent" : ""}`,
    });
    block.style.gridArea = col.key;

    // Label row — identical structure to renderCanvas()
    const labelRow = block.createEl("div", { cls: "vizardry-block-label-row" });
    labelRow.createEl("span", { cls: "vizardry-block-label", text: col.label });

    // Body — mirrors vizardry-block-body; override white-space for item list
    const body = block.createEl("div", { cls: "vizardry-block-body vzd-raci-body" });

    if (rows.length === 0) {
      // Initial state: show definition as faint italic placeholder (same ::before CSS as other canvases)
      body.addClass("vizardry-block-empty");
      body.setAttribute("data-placeholder", RACI_DEFINITIONS[col.key]);
      return;
    }

    rows.forEach((row, rowIdx) => {
      const raw = col.key === "task" ? row.task : row[col.key];
      const value = raw ?? "";

      const item = body.createEl("div", {
        cls: `vzd-raci-item${!value ? " vzd-raci-item--empty" : ""}`,
      });

      if (value) {
        item.createEl("span", { cls: "vzd-raci-item-value", text: value });
      }

      if (isEditMode) {
        item.addClass("vzd-raci-item--editable");
        item.addEventListener("click", () => {
          activateItemEdit(item, col.key, rowIdx, value, app!, ctx!, container);
        });
      }
    });
  });
}
