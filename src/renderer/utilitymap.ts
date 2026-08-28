import type { BuyerUtilityMapData, UtilityCell } from "../types";
import type { RenderContext } from "./render-context";
import { initCanvas, renderCanvasWarnings } from "./controls";
import { parseTitle, writeCanvasTitle } from "../shared/title-edit";
import { isEditModeActive } from "../shared/editor";

export function renderBuyerUtilityMap(
  data: BuyerUtilityMapData,
  container: HTMLElement,
  rc: RenderContext = {},
): void {
  const { app, ctx, source } = rc;
  const isEditMode = !!(app && ctx && isEditModeActive(app));
  const defaultTitle = "Buyer Utility Map";
  const title = source !== undefined ? parseTitle(source, defaultTitle) : defaultTitle;
  const onTitleEdit = (isEditMode && source !== undefined)
    ? (newTitle: string) => writeCanvasTitle(app!, ctx!, container, newTitle, defaultTitle)
    : undefined;
  initCanvas(container, "utilitymap", title, undefined, source, onTitleEdit, app, ctx);
  renderCanvasWarnings(container, data.warnings);

  // Legend.
  const legend = container.createEl("div", { cls: "vzd-utility-legend" });
  const legendItem = (kind: string, label: string): void => {
    const item = legend.createEl("span", { cls: "vzd-utility-legend-item" });
    item.createEl("span", { cls: `vzd-utility-swatch vzd-utility-swatch--${kind}` });
    item.createEl("span", { text: label });
  };
  legendItem("utility", "Utility created");
  legendItem("pain", "Pain / blocker");
  legendItem("empty", "Untapped");

  const marks = new Map<string, UtilityCell>();
  for (const c of data.cells) marks.set(`${c.stageIndex}:${c.leverIndex}`, c);

  const scroll = container.createEl("div", { cls: "vzd-utility-scroll" });
  const grid = scroll.createEl("div", { cls: "vzd-utility-wrap" });
  grid.style.gridTemplateColumns = `minmax(120px, 1.2fr) repeat(${data.stages.length}, minmax(116px, 1fr))`;

  // Header row: corner + stage columns.
  const corner = grid.createEl("div", { cls: "vzd-utility-corner" });
  corner.createEl("span", { cls: "vzd-utility-corner-lever", text: "Levers ↓" });
  corner.createEl("span", { cls: "vzd-utility-corner-stage", text: "Stages →" });
  for (const stage of data.stages) {
    grid.createEl("div", { cls: "vzd-utility-stage", text: stage });
  }

  // Body rows.
  data.levers.forEach((lever, leverIndex) => {
    grid.createEl("div", { cls: "vzd-utility-lever", text: lever });
    data.stages.forEach((_stage, stageIndex) => {
      const mark = marks.get(`${stageIndex}:${leverIndex}`);
      if (!mark) {
        grid.createEl("div", { cls: "vzd-utility-cell vzd-utility-cell--empty" });
        return;
      }
      const cell = grid.createEl("div", { cls: `vzd-utility-cell vzd-utility-cell--${mark.kind}` });
      const tag = cell.createEl("span", { cls: "vzd-utility-tag" });
      tag.createEl("span", { cls: "vzd-utility-dot" });
      tag.createEl("span", { text: mark.kind === "utility" ? "Utility" : "Pain" });
      if (mark.note) cell.createEl("div", { cls: "vzd-utility-note", text: mark.note });
    });
  });
}
