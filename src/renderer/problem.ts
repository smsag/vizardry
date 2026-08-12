import { Notice } from "obsidian";
import type { FlowData, FlowNode } from "../types/problem";
import type { RenderContext } from "./render-context";
import { initCanvas, renderCanvasWarnings } from "./controls";
import { parseTitle, writeCanvasTitle } from "../shared/title-edit";
import { isEditModeActive } from "../shared/editor";
import { renderFlowGraph, type FlowEdit } from "./flow-graph";
import { writeProblemCard, removeProblemCard, insertProblemCard } from "../shared/problem-edit";

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

  // In Live Preview, cards edit in place and can be added/removed; writes go
  // back to the source lines via problem-edit. SIPOC flow passes no edit hooks.
  let edit: FlowEdit | undefined;
  if (isEditMode && app && ctx) {
    const stageKeys = data.stages.map(s => s.key);
    const eyebrowByStage = new Map(data.stages.map(s => [s.key, s.eyebrow]));
    const indexById = new Map(data.nodes.map((n, i) => [n.id, i]));
    const failed = (): void => { new Notice("Vizardry: couldn't save — open the note in editing mode."); };
    edit = {
      editText: (node: FlowNode, heading: string, body: string) => {
        const i = indexById.get(node.id);
        if (i === undefined) { failed(); return; }
        // Clearing both fields removes the card rather than leaving an empty line.
        const ok = (!heading.trim() && !body.trim())
          ? removeProblemCard(app, ctx, container, i, stageKeys)
          : writeProblemCard(app, ctx, container, i, stageKeys, heading, body);
        if (!ok) failed();
      },
      deleteCard: (node: FlowNode) => {
        const i = indexById.get(node.id);
        if (i === undefined || !removeProblemCard(app, ctx, container, i, stageKeys)) failed();
      },
      addCard: (stageKey: string) => {
        const placeholder = `New ${eyebrowByStage.get(stageKey) ?? "card"}`;
        if (!insertProblemCard(app, ctx, container, stageKey, stageKeys, placeholder)) failed();
      },
    };
  }

  // Each column stacks its cards at their natural height (alignRows: false).
  renderFlowGraph(wrap, { stages: data.stages, nodes: data.nodes, edges: data.edges, edit }, rc);
  renderCanvasWarnings(container, data.warnings);
}
