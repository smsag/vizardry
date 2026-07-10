/**
 * In-place source edits for the Opportunity Solution Tree (OST) canvas.
 *
 * Source format (indent-based, outcome keyword only on the root):
 *   outcome: Desired Outcome
 *     Opportunity One
 *       Solution A
 *         Experiment 1
 *           Assumption X
 *
 * Structurally identical to mindmap-edit.ts / scqa-edit.ts's rename/add/
 * delete (and driven by the same shared engine) — only the root keyword and
 * the max depth (4: outcome/opportunity/solution/experiment/assumption)
 * differ.
 */

import type { App, MarkdownPostProcessorContext } from "obsidian";
import { renameRootKwTreeNode, addRootKwTreeChild, deleteRootKwTreeNode } from "./rootkw-tree-edit";
import type { RootKwTreeConfig } from "./rootkw-tree-edit";

const CONFIG: RootKwTreeConfig = { rootKeyword: "outcome", maxDepth: 4 };

export function renameOSTNode(
  app: App, ctx: MarkdownPostProcessorContext, el: HTMLElement,
  oldText: string, newText: string,
): boolean {
  return renameRootKwTreeNode(app, ctx, el, CONFIG, oldText, newText);
}

export function addOSTChild(
  app: App, ctx: MarkdownPostProcessorContext, el: HTMLElement,
  parentText: string, newChildText: string,
): boolean {
  return addRootKwTreeChild(app, ctx, el, CONFIG, parentText, newChildText);
}

export function deleteOSTNode(
  app: App, ctx: MarkdownPostProcessorContext, el: HTMLElement,
  nodeText: string,
): boolean {
  return deleteRootKwTreeNode(app, ctx, el, CONFIG, nodeText);
}
