import type { App, MarkdownPostProcessorContext } from "obsidian";
import type { ImpactMap, MindMap, OSTTree } from "../types";
import { initCanvas } from "./controls";
import { adaptImpactMapToTree, adaptMindMapToTree, adaptOSTToTree, IMPACT_MAP_OPTS, MINDMAP_OPTS, OST_TREE_OPTIONS, renderTree } from "./tree";
import type { LinkResolver } from "../shared/links";
import { NULL_RESOLVER } from "../shared/links";
import { parseTitle, writeCanvasTitle } from "../shared/title-edit";

export function renderMindMap(
  map: MindMap,
  container: HTMLElement,
  resolver: LinkResolver = NULL_RESOLVER,
  navigateTo?: (heading: string) => void,
  source?: string,
  app?: App,
  ctx?: MarkdownPostProcessorContext,
): void {
  const defaultTitle = "Mind Map";
  const title = source !== undefined ? parseTitle(source, defaultTitle) : defaultTitle;
  const onTitleEdit = (app && ctx && source !== undefined)
    ? (newTitle: string) => writeCanvasTitle(app, ctx, container, newTitle, defaultTitle)
    : undefined;
  initCanvas(container, "mindmap", title, undefined, source, onTitleEdit);
  renderTree(adaptMindMapToTree(map), MINDMAP_OPTS, container, resolver, navigateTo);
}

export function renderImpactMap(
  map: ImpactMap,
  container: HTMLElement,
  resolver: LinkResolver = NULL_RESOLVER,
  navigateTo?: (heading: string) => void,
  source?: string,
  app?: App,
  ctx?: MarkdownPostProcessorContext,
): void {
  const defaultTitle = "Impact Map";
  const title = source !== undefined ? parseTitle(source, defaultTitle) : defaultTitle;
  const onTitleEdit = (app && ctx && source !== undefined)
    ? (newTitle: string) => writeCanvasTitle(app, ctx, container, newTitle, defaultTitle)
    : undefined;
  initCanvas(container, "impact", title, undefined, source, onTitleEdit);
  renderTree(adaptImpactMapToTree(map), IMPACT_MAP_OPTS, container, resolver, navigateTo);
}

export function renderOST(
  tree: OSTTree,
  el: HTMLElement,
  resolver: LinkResolver = NULL_RESOLVER,
  navigateTo?: (heading: string) => void,
  source?: string,
  app?: App,
  ctx?: MarkdownPostProcessorContext,
): void {
  const defaultTitle = "Opportunity Solution Tree";
  const title = source !== undefined ? parseTitle(source, defaultTitle) : defaultTitle;
  const onTitleEdit = (app && ctx && source !== undefined)
    ? (newTitle: string) => writeCanvasTitle(app, ctx, el, newTitle, defaultTitle)
    : undefined;
  initCanvas(el, "ost", title, undefined, source, onTitleEdit);
  renderTree(adaptOSTToTree(tree), OST_TREE_OPTIONS, el, resolver, navigateTo);
}
