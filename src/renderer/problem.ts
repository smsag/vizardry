import type { FlowData } from "../types/problem";
import type { RenderContext } from "./render-context";
import { initCanvas, renderCanvasWarnings } from "./controls";
import { parseTitle, writeCanvasTitle } from "../shared/title-edit";
import { isEditModeActive } from "../shared/editor";
import { renderFlowGraph } from "./flow-graph";

export function renderProblem(
  data: FlowData,
  container: HTMLElement,
  rc: RenderContext = {},
): void {
  const { app, ctx, source } = rc;
  const isEditMode = !!(app && ctx && isEditModeActive(app));
  const defaultTitle = "Problem Statement";
  const title = source !== undefined ? parseTitle(source, defaultTitle) : defaultTitle;
  const onTitleEdit = (isEditMode && source !== undefined)
    ? (newTitle: string) => writeCanvasTitle(app!, ctx!, container, newTitle, defaultTitle)
    : undefined;
  initCanvas(container, "problem", title, undefined, source, onTitleEdit, app, ctx);

  const wrap = container.createEl("div", { cls: "vzd-flow-wrap" });
  // Each column stacks its cards at their natural height (alignRows: false).
  renderFlowGraph(wrap, { stages: data.stages, nodes: data.nodes, edges: data.edges }, rc);
  renderCanvasWarnings(container, data.warnings);
}
