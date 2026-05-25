import { ImpactMap, MindMap, OSTTree } from "../types";
import { initCanvas } from "./controls";
import { adaptImpactMapToTree, adaptMindMapToTree, IMPACT_MAP_OPTS, MINDMAP_OPTS, OST_TREE_OPTIONS, renderTree } from "./tree";

export function renderMindMap(map: MindMap, container: HTMLElement): void {
  initCanvas(container, "mindmap", "Mind Map");
  renderTree(adaptMindMapToTree(map), MINDMAP_OPTS, container);
}

export function renderImpactMap(map: ImpactMap, container: HTMLElement): void {
  initCanvas(container, "impact", "Impact Map");
  renderTree(adaptImpactMapToTree(map), IMPACT_MAP_OPTS, container);
}

export function renderOST(tree: OSTTree, el: HTMLElement): void {
  initCanvas(el, "ost", "Opportunity Solution Tree");
  renderTree(tree, OST_TREE_OPTIONS, el);
}
