/**
 * In-place source edits for the Impact Map canvas.
 *
 * Source format (keyword-based, four levels):
 *   goal: Desired Goal
 *   actor: User
 *     impact: Increased productivity
 *       deliverable: Feature A
 *
 * Level keywords:
 *   0 → "goal"         (at indent 0)
 *   1 → "actor"        (at indent 0)
 *   2 → "impact"       (indented under actor)
 *   3 → "deliverable"  (indented under impact)
 *
 * Note: goal and actor are both at indent 0 in the source.
 * Nesting is tracked structurally (impact must follow actor, etc.)
 * rather than by indentation level.
 *
 * Structurally identical to fishbone-edit.ts (and driven by the same shared
 * engine) — only the keywords differ.
 */

import type { App, MarkdownPostProcessorContext } from "obsidian";
import { renameKeywordTreeNode, addKeywordTreeChild, deleteKeywordTreeNode } from "./keyword-tree-edit";
import type { KeywordTreeConfig } from "./keyword-tree-edit";

export type ImpactLevel = "goal" | "actor" | "impact" | "deliverable";

const CONFIG: KeywordTreeConfig = {
  levelKeyword: { 0: "goal", 1: "actor", 2: "impact", 3: "deliverable" },
};

/** Renames an Impact Map node at the given level. */
export function renameImpactNode(
  app: App, ctx: MarkdownPostProcessorContext, el: HTMLElement,
  level: number, oldText: string, newText: string,
): boolean {
  return renameKeywordTreeNode(app, ctx, el, CONFIG, level, oldText, newText);
}

/** Appends a new child under the node identified by (level, parentText). */
export function addImpactChild(
  app: App, ctx: MarkdownPostProcessorContext, el: HTMLElement,
  parentLevel: number, parentText: string, newChildText: string,
): boolean {
  return addKeywordTreeChild(app, ctx, el, CONFIG, parentLevel, parentText, newChildText);
}

/** Deletes an Impact Map node and its entire subtree. Refuses to delete the
 *  goal (level 0) — it is the mandatory root. */
export function deleteImpactNode(
  app: App, ctx: MarkdownPostProcessorContext, el: HTMLElement,
  level: number, nodeText: string,
): boolean {
  return deleteKeywordTreeNode(app, ctx, el, CONFIG, level, nodeText);
}
