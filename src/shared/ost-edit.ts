/**
 * In-place source edits for the Opportunity Solution Tree (OST) canvas.
 *
 * Source format (keyword-per-level, strict-nesting — see keyword-tree.ts):
 *   outcome: Desired Outcome
 *     opportunity: Users don't grasp the value
 *       solution: Add an interactive tour
 *         experiment: A/B test tour vs. video
 *           assumption: Users prefer guided tours
 *
 * Level keywords: 0 outcome · 1 opportunity · 2 solution · 3 experiment ·
 * 4 assumption. Unlike Impact Map, every level nests one indent unit under
 * its parent (strictNesting), so this is driven by the same keyword-tree
 * engine with that flag set.
 */

import type { App, MarkdownPostProcessorContext } from "obsidian";
import { renameKeywordTreeNode, addKeywordTreeChild, deleteKeywordTreeNode } from "./keyword-tree-edit";
import type { KeywordTreeConfig } from "./keyword-tree-edit";

const CONFIG: KeywordTreeConfig = {
  levelKeyword: { 0: "outcome", 1: "opportunity", 2: "solution", 3: "experiment", 4: "assumption" },
  strictNesting: true,
};

export function renameOSTNode(
  app: App, ctx: MarkdownPostProcessorContext, el: HTMLElement,
  level: number, oldText: string, newText: string,
): boolean {
  return renameKeywordTreeNode(app, ctx, el, CONFIG, level, oldText, newText);
}

export function addOSTChild(
  app: App, ctx: MarkdownPostProcessorContext, el: HTMLElement,
  parentLevel: number, parentText: string, newChildText: string,
): boolean {
  return addKeywordTreeChild(app, ctx, el, CONFIG, parentLevel, parentText, newChildText);
}

export function deleteOSTNode(
  app: App, ctx: MarkdownPostProcessorContext, el: HTMLElement,
  level: number, nodeText: string,
): boolean {
  return deleteKeywordTreeNode(app, ctx, el, CONFIG, level, nodeText);
}
