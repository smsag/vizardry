/**
 * In-place source edits for the Mind Map canvas.
 *
 * Source format (indent-based, root keyword only):
 *   root: Central Idea
 *     Branch One
 *       Leaf A
 *     Branch Two
 *
 * Structurally identical to ost-edit.ts / scqa-edit.ts's rename/add/delete
 * (and driven by the same shared engine) — only the root keyword (and, for
 * OST, a max depth) differs.
 */

import type { App, MarkdownPostProcessorContext } from "obsidian";
import { renameRootKwTreeNode, addRootKwTreeChild, deleteRootKwTreeNode } from "./rootkw-tree-edit";
import type { RootKwTreeConfig } from "./rootkw-tree-edit";

const CONFIG: RootKwTreeConfig = { rootKeyword: "root" };

/** Renames a Mind Map node in-place. */
export function renameMindMapNode(
  app: App, ctx: MarkdownPostProcessorContext, el: HTMLElement,
  oldText: string, newText: string,
): boolean {
  return renameRootKwTreeNode(app, ctx, el, CONFIG, oldText, newText);
}

/** Appends a new child node under the node whose text matches `parentText`. */
export function addMindMapChild(
  app: App, ctx: MarkdownPostProcessorContext, el: HTMLElement,
  parentText: string, newChildText: string,
): boolean {
  return addRootKwTreeChild(app, ctx, el, CONFIG, parentText, newChildText);
}

/** Deletes a Mind Map node and its entire subtree. Refuses to delete the root. */
export function deleteMindMapNode(
  app: App, ctx: MarkdownPostProcessorContext, el: HTMLElement,
  nodeText: string,
): boolean {
  return deleteRootKwTreeNode(app, ctx, el, CONFIG, nodeText);
}
