import type { App, MarkdownPostProcessorContext } from "obsidian";
import type { ScenarioData, ScenarioQuadrantKey } from "../types";
import { initCanvas } from "./controls";
import { renderTwoPassCells, buildCardDropTargets, type TwoPassCell } from "./two-pass-cells";
import type { LinkResolver } from "../shared/links";

// Grid order (row-major): top row then bottom row.
const QUAD_ORDER: ScenarioQuadrantKey[] = ["top-left", "top-right", "bottom-left", "bottom-right"];

/**
 * Renders the Scenario Matrix: a 2×2 grid of named scenarios framed by two
 * user-defined axes (each with a low/high pole). Quadrant content renders as
 * cards (via the shared two-pass renderer), so lines can link to note headings
 * and be dragged between scenarios.
 */
export function renderScenario(
  data: ScenarioData,
  container: HTMLElement,
  source?: string,
  app?: App,
  ctx?: MarkdownPostProcessorContext,
  resolver?: LinkResolver,
  navigateTo?: (heading: string) => void,
): void {
  initCanvas(container, "scenario", "Scenario Matrix", undefined, source, undefined, app, ctx);

  const wrap = container.createEl("div", { cls: "vzd-scenario-wrap" });

  // Y-axis name, rotated along the left edge.
  const yName = wrap.createEl("div", { cls: "vzd-scenario-yname" });
  yName.createEl("span", { text: data.yAxis.name });

  const plot = wrap.createEl("div", { cls: "vzd-scenario-plot" });
  plot.createEl("div", { cls: "vzd-scenario-pole vzd-scenario-pole--top", text: data.yAxis.high });

  const grid = plot.createEl("div", { cls: "vzd-scenario-grid" });
  const cells: TwoPassCell[] = [];
  for (const key of QUAD_ORDER) {
    const quad = data.quadrants[key];
    const cell = grid.createEl("div", { cls: "vzd-scenario-cell" });
    cell.dataset.quad = key;
    const name = cell.createEl("div", { cls: "vzd-scenario-cell-name" });
    name.textContent = quad.name;
    const body = cell.createEl("div", { cls: "vizardry-block-body" });
    cells.push({ body, label: key, content: quad.content, isCard: true });
  }

  plot.createEl("div", { cls: "vzd-scenario-pole vzd-scenario-pole--bottom", text: data.yAxis.low });

  const xRow = plot.createEl("div", { cls: "vzd-scenario-xrow" });
  xRow.createEl("span", { cls: "vzd-scenario-pole", text: data.xAxis.low });
  xRow.createEl("span", { cls: "vzd-scenario-xname", text: data.xAxis.name });
  xRow.createEl("span", { cls: "vzd-scenario-pole", text: data.xAxis.high });

  const cardTargets = buildCardDropTargets(cells);
  renderTwoPassCells(cells, cardTargets, container, app, ctx, resolver, navigateTo);
}
