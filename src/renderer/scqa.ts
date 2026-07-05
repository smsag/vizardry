import type { App, MarkdownPostProcessorContext } from "obsidian";
import type { SCQAData, SCQANode, TreeEditHandlers, TreeNode } from "../types";
import { initCanvas, markInteractive, renderHeadingLink } from "./controls";
import {
  renderTree, adaptSCQAToTree, SCQA_TREE_OPTIONS, SCR_TREE_OPTIONS,
} from "./tree";
import { renderInline } from "../shared/inline-markdown";
import { parseTitle, writeCanvasTitle } from "../shared/title-edit";
import { t } from "../i18n";
import type { LinkResolver } from "../shared/links";
import { NULL_RESOLVER } from "../shared/links";
import {
  renameSCQANode, addSCQAChild, deleteSCQANode, reorderSCQANode,
} from "../shared/scqa-edit";
import { enableDragGesture } from "../shared/drag-gesture";

// Default label for a newly-added child, by the parent's level. Role words are
// part of the DSL (kept English, like block labels), so they are not i18n'd.
function childDefault(variant: SCQAData["variant"], parentLevel: number): string {
  if (parentLevel === 0) return "Complication";
  if (parentLevel === 1) return variant === "scqa" ? "Question" : "Resolution";
  return "Answer";
}

export function renderSCQA(
  data: SCQAData,
  el: HTMLElement,
  resolver: LinkResolver = NULL_RESOLVER,
  navigateTo?: (heading: string) => void,
  source?: string,
  app?: App,
  ctx?: MarkdownPostProcessorContext,
): void {
  const defaultTitle = data.variant === "scqa" ? "SCQA Narrative" : "SCR Narrative";
  const title = source !== undefined ? parseTitle(source, defaultTitle) : defaultTitle;
  const onTitleEdit = (app && ctx && source !== undefined)
    ? (newTitle: string) => writeCanvasTitle(app, ctx, el, newTitle, defaultTitle)
    : undefined;
  initCanvas(el, data.variant, title, undefined, source, onTitleEdit, app);

  if (data.view === "tree") {
    const opts = data.variant === "scqa" ? SCQA_TREE_OPTIONS : SCR_TREE_OPTIONS;
    const editHandlers = (app && ctx) ? makeHandlers(app, ctx, el) : undefined;
    renderTree(adaptSCQAToTree(data), opts, el, resolver, navigateTo, editHandlers);
    return;
  }

  renderGrid(data, el, app, ctx, resolver, navigateTo);
}

function makeHandlers(
  app: App,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
): TreeEditHandlers {
  return {
    onRename(node: TreeNode, newText: string): void {
      if (!renameSCQANode(app, ctx, el, node.text, newText)) showWriteFailedNotice(el);
    },
    onAddChild(node: TreeNode): void {
      if (!addSCQAChild(app, ctx, el, node.text, childDefault(nodeVariant(el), node.level))) showWriteFailedNotice(el);
    },
    onDelete(node: TreeNode): void {
      if (!deleteSCQANode(app, ctx, el, node.text)) showWriteFailedNotice(el);
    },
  };
}

// The variant is needed for add-child defaults inside tree handlers; read it
// back off the canvas element (set by initCanvas via data-framework).
function nodeVariant(el: HTMLElement): SCQAData["variant"] {
  return el.getAttribute("data-framework") === "scr" ? "scr" : "scqa";
}

// ── Grid view ────────────────────────────────────────────────────────────────

interface Placed {
  node: SCQANode;
  col: number;   // 0-based leftmost column
  span: number;  // number of leaf columns spanned
}

function leafSpan(node: SCQANode): number {
  if (node.children.length === 0) return 1;
  return node.children.reduce((sum, c) => sum + leafSpan(c), 0);
}

function placeNodes(root: SCQANode): Placed[] {
  const placed: Placed[] = [];
  const walk = (n: SCQANode, col: number): void => {
    placed.push({ node: n, col, span: leafSpan(n) });
    let cursor = col;
    for (const child of n.children) {
      walk(child, cursor);
      cursor += leafSpan(child);
    }
  };
  walk(root, 0);
  return placed;
}

function renderGrid(
  data: SCQAData,
  el: HTMLElement,
  app?: App,
  ctx?: MarkdownPostProcessorContext,
  resolver?: LinkResolver,
  navigateTo?: (heading: string) => void,
): void {
  const editable = !!(app && ctx);
  const placed = placeNodes(data.root);
  const totalCols = Math.max(1, leafSpan(data.root));

  const scroller = el.createEl("div", { cls: "vzd-scqa-scroll" });
  const grid = scroller.createEl("div", { cls: "vzd-scqa-grid" });
  grid.style.setProperty("--vzd-scqa-cols", String(totalCols));

  for (const { node, col, span } of placed) {
    const card = grid.createEl("div", { cls: `vzd-scqa-card vzd-scqa-card--l${node.level}` });
    card.style.gridColumn = `${col + 1} / span ${span}`;
    card.style.gridRow = String(node.level + 1);
    card.dataset.scqaText = node.text;
    card.dataset.scqaLevel = String(node.level);

    const textEl = card.createEl("div", { cls: "vzd-scqa-card-text" });
    renderInline(textEl, node.text);
    renderHeadingLink(card, node.text, resolver, navigateTo);

    if (!editable) continue;
    markInteractive(card);

    // Inline rename on click (situation root included).
    textEl.addEventListener("click", (e) => {
      e.stopPropagation();
      activateInlineRename(textEl, node.text, (next) => {
        if (!renameSCQANode(app!, ctx!, el, node.text, next)) showWriteFailedNotice(el);
      });
    });

    // "+" add child, where depth allows.
    const maxAddLevel = data.variant === "scqa" ? 3 : 2;
    if (node.level < maxAddLevel) {
      const addBtn = card.createEl("button", { cls: "vzd-scqa-card-add vzd-btn", text: "+" });
      addBtn.setAttribute("aria-label", t("tree.addChild"));
      addBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!addSCQAChild(app!, ctx!, el, node.text, childDefault(data.variant, node.level))) showWriteFailedNotice(el);
      });
    }

    // "×" delete (any node except the situation root).
    if (node.level > 0) {
      const delBtn = card.createEl("button", { cls: "vzd-scqa-card-del vzd-btn", text: "×" });
      delBtn.setAttribute("aria-label", t("tree.deleteNode"));
      delBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!deleteSCQANode(app!, ctx!, el, node.text)) showWriteFailedNotice(el);
      });

      // Drag to reorder among siblings (reorder-only — never re-parents).
      enableReorderDrag(card, node, data.root, el, app!, ctx!);
    }
  }
}

/** Siblings of `node` (its parent's children), in source order. */
function siblingsOf(root: SCQANode, node: SCQANode): SCQANode[] {
  let found: SCQANode[] | null = null;
  const walk = (n: SCQANode): void => {
    if (n.children.includes(node)) found = n.children;
    else n.children.forEach(walk);
  };
  walk(root);
  return found ?? [];
}

function enableReorderDrag(
  card: HTMLElement,
  node: SCQANode,
  root: SCQANode,
  container: HTMLElement,
  app: App,
  ctx: MarkdownPostProcessorContext,
): void {
  // Only reorderable when the node has a sibling to swap with.
  const siblings = siblingsOf(root, node);
  if (siblings.length < 2) return;
  card.classList.add("vzd-scqa-card--draggable");

  const doc = container.ownerDocument;
  let ghost: HTMLElement | null = null;
  let siblingCards: HTMLElement[] = [];
  let lastX = 0;

  enableDragGesture(card, {
    shouldStart: (target) => !target.closest("button, input"),
    onStart: (x, y) => {
      lastX = x;
      card.classList.add("vzd-scqa-card--dragging");
      // Sibling card centres, captured at drag start in DOM order.
      siblingCards = siblings
        .map(s => container.querySelector<HTMLElement>(`.vzd-scqa-card[data-scqa-text="${CSS.escape(s.text)}"]`))
        .filter((c): c is HTMLElement => c !== null);
      ghost = doc.body.createEl("div", { cls: "vzd-scqa-card vzd-scqa-drag-ghost" });
      ghost.textContent = node.text;
      ghost.style.left = `${x + 8}px`;
      ghost.style.top = `${y + 8}px`;
    },
    onMove: (x, y) => {
      lastX = x;
      if (ghost) {
        ghost.style.left = `${x + 8}px`;
        ghost.style.top = `${y + 8}px`;
      }
    },
    onEnd: () => {
      ghost?.remove();
      ghost = null;
      card.classList.remove("vzd-scqa-card--dragging");
      // Insert before the first sibling whose centre is right of the drop point.
      let targetIndex = 0;
      for (const sc of siblingCards) {
        const r = sc.getBoundingClientRect();
        if (lastX > r.left + r.width / 2) targetIndex++;
      }
      // No-op reorders return false silently; getEditorAccess surfaces its own
      // write-mode notice on genuine failure.
      reorderSCQANode(app, ctx, container, node.text, targetIndex);
    },
  });
}

// ── Inline rename ────────────────────────────────────────────────────────────

function activateInlineRename(
  host: HTMLElement,
  current: string,
  onCommit: (next: string) => void,
): void {
  if (host.classList.contains("vzd-editing")) return;
  host.classList.add("vzd-editing");
  host.textContent = "";
  const input = host.createEl("input", { cls: "vzd-inline-input", type: "text" });
  input.value = current;
  input.focus({ preventScroll: true });
  input.select();

  let committed = false;
  const finish = (commit: boolean): void => {
    if (committed) return;
    committed = true;
    host.classList.remove("vzd-editing");
    const next = input.value.trim();
    host.empty();
    if (commit && next && next !== current) {
      renderInline(host, next);
      onCommit(next);
    } else {
      renderInline(host, current);
    }
  };

  input.addEventListener("blur", () => finish(true));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); finish(true); }
    if (e.key === "Escape") { e.preventDefault(); finish(false); }
  });
}

// ── Shared ───────────────────────────────────────────────────────────────────

function showWriteFailedNotice(container: HTMLElement): void {
  const notice = container.createEl("div", {
    cls: "vzd-tree-write-notice",
    text: t("tree.writeFailed"),
  });
  setTimeout(() => notice.remove(), 3000);
}
