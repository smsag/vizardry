/**
 * In-place source edits for the Opportunity Solution Tree (OST) canvas.
 *
 * Source format (keyword-per-level, strict-nesting — see keyword-tree.ts):
 *   outcome: Desired Outcome
 *     need: Users don't grasp the value
 *       solution: Add an interactive tour
 *         Tenant credit checks        ← bare line = bullet on the solution
 *         experiment: A/B test tour vs. video
 *
 * Lane keywords: 0 outcome · 1 need/pain/desire · 2 solution · 3 experiment.
 * The Opportunity lane accepts three keywords, so a node's own keyword is
 * passed through (`nodeKeyword`) to locate its source line. Every level nests
 * one indent unit under its parent (strictNesting).
 */

import type { App, MarkdownPostProcessorContext } from "obsidian";
import {
  renameKeywordTreeNode, addKeywordTreeChild, deleteKeywordTreeNode,
  addKeywordTreeBullet, editKeywordTreeBullet, deleteKeywordTreeBullet,
} from "./keyword-tree-edit";
import type { KeywordTreeConfig } from "./keyword-tree-edit";

const CONFIG: KeywordTreeConfig = {
  levelKeyword: { 0: "outcome", 1: "need", 2: "solution", 3: "experiment" },
  levelAliases: { 1: ["pain", "desire"] },
  strictNesting: true,
};

export function renameOSTNode(
  app: App, ctx: MarkdownPostProcessorContext, el: HTMLElement,
  keyword: string, level: number, oldText: string, newText: string,
): boolean {
  return renameKeywordTreeNode(app, ctx, el, CONFIG, level, oldText, newText, keyword);
}

export function addOSTChild(
  app: App, ctx: MarkdownPostProcessorContext, el: HTMLElement,
  keyword: string, parentLevel: number, parentText: string, newChildText: string,
): boolean {
  return addKeywordTreeChild(app, ctx, el, CONFIG, parentLevel, parentText, newChildText, keyword);
}

export function deleteOSTNode(
  app: App, ctx: MarkdownPostProcessorContext, el: HTMLElement,
  keyword: string, level: number, nodeText: string,
): boolean {
  return deleteKeywordTreeNode(app, ctx, el, CONFIG, level, nodeText, keyword);
}

export function addOSTBullet(
  app: App, ctx: MarkdownPostProcessorContext, el: HTMLElement,
  keyword: string, nodeText: string, bulletText: string,
): boolean {
  return addKeywordTreeBullet(app, ctx, el, CONFIG, keyword, nodeText, bulletText);
}

export function editOSTBullet(
  app: App, ctx: MarkdownPostProcessorContext, el: HTMLElement,
  keyword: string, nodeText: string, oldBullet: string, newBullet: string,
): boolean {
  return editKeywordTreeBullet(app, ctx, el, CONFIG, keyword, nodeText, oldBullet, newBullet);
}

export function deleteOSTBullet(
  app: App, ctx: MarkdownPostProcessorContext, el: HTMLElement,
  keyword: string, nodeText: string, bulletText: string,
): boolean {
  return deleteKeywordTreeBullet(app, ctx, el, CONFIG, keyword, nodeText, bulletText);
}
