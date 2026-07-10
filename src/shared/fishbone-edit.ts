/**
 * In-place source edits for the Fishbone (Ishikawa) diagram canvas.
 *
 * Source format (keyword-based, four levels):
 *   effect: Problem statement
 *   category: Technology
 *     cause: API latency
 *       subcause: Slow queries
 *
 * Level keywords:
 *   0 → "effect"    (at indent 0, mandatory root)
 *   1 → "category"  (at indent 0, like "actor" in Impact Map)
 *   2 → "cause"     (indented under category)
 *   3 → "subcause"  (indented under cause)
 *
 * Note: effect and category are both at indent 0 in the source.
 * Hierarchy is tracked structurally, the same way Impact Map handles
 * goal + actor at the same indent level.
 *
 * Structurally identical to impact-edit.ts (and driven by the same shared
 * engine) — only the keywords differ.
 */

import type { App, MarkdownPostProcessorContext } from "obsidian";
import { renameKeywordTreeNode, addKeywordTreeChild, deleteKeywordTreeNode } from "./keyword-tree-edit";
import type { KeywordTreeConfig } from "./keyword-tree-edit";

export type FishboneLevel = "effect" | "category" | "cause" | "subcause";

const CONFIG: KeywordTreeConfig = {
  levelKeyword: { 0: "effect", 1: "category", 2: "cause", 3: "subcause" },
};

/** Renames a Fishbone node at the given tree level. */
export function renameFishboneNode(
  app: App, ctx: MarkdownPostProcessorContext, el: HTMLElement,
  level: number, oldText: string, newText: string,
): boolean {
  return renameKeywordTreeNode(app, ctx, el, CONFIG, level, oldText, newText);
}

/** Appends a new child under the node identified by (level, parentText). */
export function addFishboneChild(
  app: App, ctx: MarkdownPostProcessorContext, el: HTMLElement,
  parentLevel: number, parentText: string, newChildText: string,
): boolean {
  return addKeywordTreeChild(app, ctx, el, CONFIG, parentLevel, parentText, newChildText);
}

/** Deletes a Fishbone node and its entire subtree. Refuses to delete the
 *  effect (level 0) — it is the mandatory root. */
export function deleteFishboneNode(
  app: App, ctx: MarkdownPostProcessorContext, el: HTMLElement,
  level: number, nodeText: string,
): boolean {
  return deleteKeywordTreeNode(app, ctx, el, CONFIG, level, nodeText);
}
