import type { App, MarkdownPostProcessorContext } from "obsidian";
import type { FishboneDiagram, ImpactMap, MindMap, OSTTree, TreeEditHandlers, TreeNode } from "../types";
import { initCanvas, renderCanvasWarnings } from "./controls";
import { renderTree } from "./tree";
import { adaptFishboneToTree, adaptImpactMapToTree, adaptMindMapToTree, adaptOSTToTree, FISHBONE_OPTS, IMPACT_MAP_OPTS, MINDMAP_OPTS, ostTreeOptions } from "./tree-adapters";
import type { LinkResolver } from "../shared/links";
import { NULL_RESOLVER } from "../shared/links";
import type { RenderContext } from "./render-context";
import { parseTitle, writeCanvasTitle } from "../shared/title-edit";
import { isEditModeActive } from "../shared/editor";
import { t } from "../i18n";
import { renameRootKwTreeNode, addRootKwTreeChild, deleteRootKwTreeNode } from "../shared/rootkw-tree-edit";
import type { RootKwTreeConfig } from "../shared/rootkw-tree-edit";
import {
  renameKeywordTreeNode, addKeywordTreeChild, deleteKeywordTreeNode,
  addKeywordTreeBullet, editKeywordTreeBullet, deleteKeywordTreeBullet,
} from "../shared/keyword-tree-edit";
import type { KeywordTreeConfig } from "../shared/keyword-tree-edit";

const MINDMAP_CONFIG: RootKwTreeConfig = { rootKeyword: "root" };

const FISHBONE_CONFIG: KeywordTreeConfig = {
  levelKeyword: { 0: "effect", 1: "category", 2: "cause", 3: "subcause" },
};

const IMPACT_CONFIG: KeywordTreeConfig = {
  levelKeyword: { 0: "goal", 1: "actor", 2: "impact", 3: "deliverable" },
};

const OST_CONFIG: KeywordTreeConfig = {
  levelKeyword: { 0: "outcome", 1: "need", 2: "solution", 3: "experiment" },
  levelAliases: { 1: ["pain", "desire"] },
  strictNesting: true,
};

// ── Mind Map ──────────────────────────────────────────────────────────────────

export function renderMindMap(
  map: MindMap,
  container: HTMLElement,
  rc: RenderContext = {},
): void {
  const { navigateTo, source, app, ctx } = rc;
  const resolver = rc.resolver ?? NULL_RESOLVER;
  const isEditMode = !!(app && ctx && isEditModeActive(app));
  const defaultTitle = "Mind Map";
  const title = source !== undefined ? parseTitle(source, defaultTitle) : defaultTitle;
  const onTitleEdit = (isEditMode && source !== undefined)
    ? (newTitle: string) => writeCanvasTitle(app!, ctx!, container, newTitle, defaultTitle)
    : undefined;
  initCanvas(container, "mindmap", title, undefined, source, onTitleEdit, app, ctx);

  const editHandlers = isEditMode ? makeMindMapHandlers(app!, ctx!, container, map, resolver, navigateTo, source) : undefined;
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
      if (!renameRootKwTreeNode(app, ctx, container, MINDMAP_CONFIG, node.text, newText)) {
        showWriteFailedNotice(container);
      }
    },
    onAddChild(node: TreeNode): void {
      if (!addRootKwTreeChild(app, ctx, container, MINDMAP_CONFIG, node.text, t("tree.newNode"))) {
        showWriteFailedNotice(container);
      }
    },
    onDelete(node: TreeNode): void {
      if (!deleteRootKwTreeNode(app, ctx, container, MINDMAP_CONFIG, node.text)) {
        showWriteFailedNotice(container);
      }
    },
  };
}

// ── Impact Map ────────────────────────────────────────────────────────────────

export function renderImpactMap(
  map: ImpactMap,
  container: HTMLElement,
  rc: RenderContext = {},
): void {
  const { navigateTo, source, app, ctx } = rc;
  const resolver = rc.resolver ?? NULL_RESOLVER;
  const isEditMode = !!(app && ctx && isEditModeActive(app));
  const defaultTitle = "Impact Map";
  const title = source !== undefined ? parseTitle(source, defaultTitle) : defaultTitle;
  const onTitleEdit = (isEditMode && source !== undefined)
    ? (newTitle: string) => writeCanvasTitle(app!, ctx!, container, newTitle, defaultTitle)
    : undefined;
  initCanvas(container, "impact", title, undefined, source, onTitleEdit, app, ctx);

  const editHandlers = isEditMode ? makeImpactHandlers(app!, ctx!, container) : undefined;
  renderTree(adaptImpactMapToTree(map), IMPACT_MAP_OPTS, container, resolver, navigateTo, editHandlers);
}

function makeImpactHandlers(
  app: App,
  ctx: MarkdownPostProcessorContext,
  container: HTMLElement,
): TreeEditHandlers {
  return {
    onRename(node: TreeNode, newText: string): void {
      if (!renameKeywordTreeNode(app, ctx, container, IMPACT_CONFIG, node.level, node.text, newText)) {
        showWriteFailedNotice(container);
      }
    },
    onAddChild(node: TreeNode): void {
      if (!addKeywordTreeChild(app, ctx, container, IMPACT_CONFIG, node.level, node.text, "")) {
        showWriteFailedNotice(container);
      }
    },
    onDelete(node: TreeNode): void {
      if (!deleteKeywordTreeNode(app, ctx, container, IMPACT_CONFIG, node.level, node.text)) {
        showWriteFailedNotice(container);
      }
    },
  };
}

// ── OST ───────────────────────────────────────────────────────────────────────

export function renderOST(
  tree: OSTTree,
  el: HTMLElement,
  rc: RenderContext = {},
): void {
  const { navigateTo, source, app, ctx } = rc;
  const resolver = rc.resolver ?? NULL_RESOLVER;
  const isEditMode = !!(app && ctx && isEditModeActive(app));
  const defaultTitle = "Opportunity Solution Tree";
  const title = source !== undefined ? parseTitle(source, defaultTitle) : defaultTitle;
  const onTitleEdit = (isEditMode && source !== undefined)
    ? (newTitle: string) => writeCanvasTitle(app!, ctx!, el, newTitle, defaultTitle)
    : undefined;
  initCanvas(el, "ost", title, undefined, source, onTitleEdit, app, ctx);
  renderCanvasWarnings(el, tree.warnings);

  const editHandlers = isEditMode ? makeOSTHandlers(app!, ctx!, el) : undefined;
  renderTree(adaptOSTToTree(tree), ostTreeOptions(), el, resolver, navigateTo, editHandlers);
}

function makeOSTHandlers(
  app: App,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
): TreeEditHandlers {
  return {
    onRename(node: TreeNode, newText: string): void {
      if (!renameKeywordTreeNode(app, ctx, el, OST_CONFIG, node.level, node.text, newText, node.key ?? "")) {
        showWriteFailedNotice(el);
      }
    },
    onAddChild(node: TreeNode): void {
      if (!addKeywordTreeChild(app, ctx, el, OST_CONFIG, node.level, node.text, t("tree.newNode"), node.key ?? "")) {
        showWriteFailedNotice(el);
      }
    },
    onDelete(node: TreeNode): void {
      if (!deleteKeywordTreeNode(app, ctx, el, OST_CONFIG, node.level, node.text, node.key ?? "")) {
        showWriteFailedNotice(el);
      }
    },
    onAddBullet(node: TreeNode, text: string): void {
      if (!addKeywordTreeBullet(app, ctx, el, OST_CONFIG, node.key ?? "", node.text, text)) {
        showWriteFailedNotice(el);
      }
    },
    onEditBullet(node: TreeNode, oldText: string, newText: string): void {
      if (!editKeywordTreeBullet(app, ctx, el, OST_CONFIG, node.key ?? "", node.text, oldText, newText)) {
        showWriteFailedNotice(el);
      }
    },
    onDeleteBullet(node: TreeNode, text: string): void {
      if (!deleteKeywordTreeBullet(app, ctx, el, OST_CONFIG, node.key ?? "", node.text, text)) {
        showWriteFailedNotice(el);
      }
    },
  };
}

// ── Fishbone ──────────────────────────────────────────────────────────────────

export function renderFishbone(
  diagram: FishboneDiagram,
  container: HTMLElement,
  rc: RenderContext = {},
): void {
  const { navigateTo, source, app, ctx } = rc;
  const resolver = rc.resolver ?? NULL_RESOLVER;
  const isEditMode = !!(app && ctx && isEditModeActive(app));
  const defaultTitle = "Fishbone Diagram";
  const title = source !== undefined ? parseTitle(source, defaultTitle) : defaultTitle;
  const onTitleEdit = (isEditMode && source !== undefined)
    ? (newTitle: string) => writeCanvasTitle(app!, ctx!, container, newTitle, defaultTitle)
    : undefined;
  initCanvas(container, "fishbone", title, undefined, source, onTitleEdit, app, ctx);
  renderCanvasWarnings(container, diagram.warnings);

  const editHandlers = isEditMode ? makeFishboneHandlers(app!, ctx!, container) : undefined;
  renderTree(adaptFishboneToTree(diagram), FISHBONE_OPTS, container, resolver, navigateTo, editHandlers);
}

function makeFishboneHandlers(
  app: App,
  ctx: MarkdownPostProcessorContext,
  container: HTMLElement,
): TreeEditHandlers {
  return {
    onRename(node: TreeNode, newText: string): void {
      if (!renameKeywordTreeNode(app, ctx, container, FISHBONE_CONFIG, node.level, node.text, newText)) {
        showWriteFailedNotice(container);
      }
    },
    onAddChild(node: TreeNode): void {
      if (!addKeywordTreeChild(app, ctx, container, FISHBONE_CONFIG, node.level, node.text, t("tree.newNode"))) {
        showWriteFailedNotice(container);
      }
    },
    onDelete(node: TreeNode): void {
      if (!deleteKeywordTreeNode(app, ctx, container, FISHBONE_CONFIG, node.level, node.text)) {
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
