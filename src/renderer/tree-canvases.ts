import type { ImpactMap, MindMap, OSTTree } from "../types";
import { initCanvas } from "./controls";
import { adaptImpactMapToTree, adaptMindMapToTree, adaptOSTToTree, IMPACT_MAP_OPTS, MINDMAP_OPTS, OST_TREE_OPTIONS, renderTree } from "./tree";
import type { LinkResolver } from "../shared/links";
import { NULL_RESOLVER } from "../shared/links";

export function renderMindMap(
  map: MindMap,
  container: HTMLElement,
  resolver: LinkResolver = NULL_RESOLVER,
  navigateTo?: (heading: string) => void,
  source?: string,
): void {
  initCanvas(container, "mindmap", "Mind Map", undefined, source);
  renderTree(adaptMindMapToTree(map), MINDMAP_OPTS, container, resolver, navigateTo);
}

export function renderImpactMap(
  map: ImpactMap,
  container: HTMLElement,
  resolver: LinkResolver = NULL_RESOLVER,
  navigateTo?: (heading: string) => void,
  source?: string,
): void {
  initCanvas(container, "impact", "Impact Map", undefined, source);
  renderTree(adaptImpactMapToTree(map), IMPACT_MAP_OPTS, container, resolver, navigateTo);
}

export function renderOST(
  tree: OSTTree,
  el: HTMLElement,
  resolver: LinkResolver = NULL_RESOLVER,
  navigateTo?: (heading: string) => void,
  source?: string,
): void {
  initCanvas(el, "ost", "Opportunity Solution Tree", undefined, source);
  renderTree(adaptOSTToTree(tree), OST_TREE_OPTIONS, el, resolver, navigateTo);
}
