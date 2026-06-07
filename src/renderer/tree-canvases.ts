import type { App, MarkdownPostProcessorContext } from "obsidian";
import type { FishboneDiagram, ImpactMap, MindMap, OSTTree, TreeEditHandlers, TreeNode } from "../types";
import { initCanvas } from "./controls";
import { adaptFishboneToTree, adaptImpactMapToTree, adaptMindMapToTree, adaptOSTToTree, FISHBONE_OPTS, IMPACT_MAP_OPTS, MINDMAP_OPTS, OST_TREE_OPTIONS, renderTree } from "./tree";
import type { LinkResolver } from "../shared/links";
import { NULL_RESOLVER } from "../shared/links";
import { parseTitle, writeCanvasTitle } from "../shared/title-edit";
import { t } from "../i18n";
import { renameMindMapNode, addMindMapChild, deleteMindMapNode } from "../shared/mindmap-edit";
import { renameOSTNode, addOSTChild, deleteOSTNode } from "../shared/ost-edit";
import { renameImpactNode, addImpactChild, deleteImpactNode } from "../shared/impact-edit";
import { renameFishboneNode, addFishboneChild, deleteFishboneNode } from "../shared/fishbone-edit";

// ── Mind Map ──────────────────────────────────────────────────────────────────

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

  const editHandlers = (app && ctx) ? makeMindMapHandlers(app, ctx, container, map, resolver, navigateTo, source) : undefined;
  renderTree(adaptMindMapToTree(map), MINDMAP_OPTS, container, resolver, navigateTo, editHandlers);
}

function makeMindMapHandlers(
  app: App,
  ctx: MarkdownPostProcessorContext,
  container: HTMLElement,
  map: MindMap,
  resolver: LinkResolver,
  navigateTo: ((h: string) => void) | undefined,
  source: string | undefined,
): TreeEditHandlers {
  return {
    onRename(node: TreeNode, newText: string): void {
      if (!renameMindMapNode(app, ctx, container, node.text, newText)) {
        showWriteFailedNotice(container);
      }
    },
    onAddChild(node: TreeNode): void {
      if (!addMindMapChild(app, ctx, container, node.text, t("tree.newNode"))) {
        showWriteFailedNotice(container);
      }
    },
    onDelete(node: TreeNode): void {
      if (!deleteMindMapNode(app, ctx, container, node.text)) {
        showWriteFailedNotice(container);
      }
    },
  };
}

// ── Impact Map ────────────────────────────────────────────────────────────────

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

  const editHandlers = (app && ctx) ? makeImpactHandlers(app, ctx, container) : undefined;
  renderTree(adaptImpactMapToTree(map), IMPACT_MAP_OPTS, container, resolver, navigateTo, editHandlers);
}

function makeImpactHandlers(
  app: App,
  ctx: MarkdownPostProcessorContext,
  container: HTMLElement,
): TreeEditHandlers {
  return {
    onRename(node: TreeNode, newText: string): void {
      if (!renameImpactNode(app, ctx, container, node.level, node.text, newText)) {
        showWriteFailedNotice(container);
      }
    },
    onAddChild(node: TreeNode): void {
      if (!addImpactChild(app, ctx, container, node.level, node.text, t("tree.newNode"))) {
        showWriteFailedNotice(container);
      }
    },
    onDelete(node: TreeNode): void {
      if (!deleteImpactNode(app, ctx, container, node.level, node.text)) {
        showWriteFailedNotice(container);
      }
    },
  };
}

// ── OST ───────────────────────────────────────────────────────────────────────

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

  const editHandlers = (app && ctx) ? makeOSTHandlers(app, ctx, el) : undefined;
  renderTree(adaptOSTToTree(tree), OST_TREE_OPTIONS, el, resolver, navigateTo, editHandlers);
}

function makeOSTHandlers(
  app: App,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
): TreeEditHandlers {
  return {
    onRename(node: TreeNode, newText: string): void {
      if (!renameOSTNode(app, ctx, el, node.text, newText)) {
        showWriteFailedNotice(el);
      }
    },
    onAddChild(node: TreeNode): void {
      if (!addOSTChild(app, ctx, el, node.text, t("tree.newNode"))) {
        showWriteFailedNotice(el);
      }
    },
    onDelete(node: TreeNode): void {
      if (!deleteOSTNode(app, ctx, el, node.text)) {
        showWriteFailedNotice(el);
      }
    },
  };
}

// ── Fishbone ──────────────────────────────────────────────────────────────────

export function renderFishbone(
  diagram: FishboneDiagram,
  container: HTMLElement,
  resolver: LinkResolver = NULL_RESOLVER,
  navigateTo?: (heading: string) => void,
  source?: string,
  app?: App,
  ctx?: MarkdownPostProcessorContext,
): void {
  const defaultTitle = "Fishbone Diagram";
  const title = source !== undefined ? parseTitle(source, defaultTitle) : defaultTitle;
  const onTitleEdit = (app && ctx && source !== undefined)
    ? (newTitle: string) => writeCanvasTitle(app, ctx, container, newTitle, defaultTitle)
    : undefined;
  initCanvas(container, "fishbone", title, undefined, source, onTitleEdit);

  const editHandlers = (app && ctx) ? makeFishboneHandlers(app, ctx, container) : undefined;
  renderTree(adaptFishboneToTree(diagram), FISHBONE_OPTS, container, resolver, navigateTo, editHandlers);
}

function makeFishboneHandlers(
  app: App,
  ctx: MarkdownPostProcessorContext,
  container: HTMLElement,
): TreeEditHandlers {
  return {
    onRename(node: TreeNode, newText: string): void {
      if (!renameFishboneNode(app, ctx, container, node.level, node.text, newText)) {
        showWriteFailedNotice(container);
      }
    },
    onAddChild(node: TreeNode): void {
      if (!addFishboneChild(app, ctx, container, node.level, node.text, t("tree.newNode"))) {
        showWriteFailedNotice(container);
      }
    },
    onDelete(node: TreeNode): void {
      if (!deleteFishboneNode(app, ctx, container, node.level, node.text)) {
        showWriteFailedNotice(container);
      }
    },
  };
}

// ── Shared ────────────────────────────────────────────────────────────────────

function showWriteFailedNotice(container: HTMLElement): void {
  // Show a brief inline notice rather than a modal — less disruptive.
  const notice = container.createEl("div", {
    cls: "vzd-tree-write-notice",
    text: t("tree.writeFailed"),
  });
  setTimeout(() => notice.remove(), 3000);
}
