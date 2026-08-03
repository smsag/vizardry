/**
 * Domain-model → generic TreeNode adapters, and the TreeRenderOptions builders,
 * for every tree-style canvas (Mind Map, Impact Map, OST, Fishbone, SCQA/SCR).
 *
 * Pure glue: maps each framework's parsed model onto the generic tree structure
 * the renderer (tree.ts) consumes, and assembles that framework's render
 * options. No SVG/DOM work and no dependency on tree.ts's rendering engine, so
 * it stays cleanly separable and cheap to test.
 */

import { Platform } from "obsidian";
import type {
  FishboneDiagram, ImpactMap, MindMap, MindMapNode, OSTNode, OSTTree,
  SCQAData, SCQANode, TreeNode, TreeNodeStyle, TreeRenderOptions,
} from "../types";
import { t } from "../i18n";
import type { TranslationKey } from "../i18n";

/** Config a swim-lane diagram supplies to build its render options. `hueVars`
 *  are CSS colour references (one per lane); `lanes[i]` labels lane i. */
export interface LaneTreeConfig {
  canvasClass: string;
  wrapperClass: string;
  lanes: { label: string }[];
  hueVars: string[];
  /** Deepest level that may add a child (leaf level has none). */
  maxAddLevel: number;
  gutterWidth?: number;
}

/** Builds swim-lane render options shared by OST and SCQA/SCR: top-down bands,
 *  wrapped outlined boxes, italic top captions, colour-per-lane borders and
 *  connectors. Rebuilt per call so lane labels track the current UI language.
 *  On mobile the boxes, gaps, and gutter shrink to reduce horizontal scroll. */
export function laneTreeOptions(cfg: LaneTreeConfig): TreeRenderOptions {
  const laneStyle = (strokeVar: string): TreeNodeStyle => ({
    fillVar: "var(--background-primary)", textVar: "var(--text-normal)",
    strokeVar, outline: true, borderRadius: 8, dashed: false,
  });
  const compact = !!Platform?.isMobile;
  return {
    nodeW: compact ? 176 : 230, nodeH: 54, levelGap: compact ? 48 : 58,
    siblingGap: compact ? 14 : 24,
    hPadding: compact ? 12 : 24, vPadding: 28, maxLabelChars: 1000,
    maxAddLevel: cfg.maxAddLevel,
    direction: "lanes",
    wrap: true,
    captionPosition: "top",
    gutterWidth: cfg.gutterWidth ?? (compact ? 96 : 150),
    canvasClass: cfg.canvasClass,
    wrapperClass: cfg.wrapperClass,
    lanes: cfg.lanes,
    levelStyles: cfg.hueVars.map(v => laneStyle(v)),
  };
}

/** OST swim-lane options: outcome / opportunity (need·pain·desire) / solution /
 *  experiment lanes, each with its own theme-aware hue. */
export function ostTreeOptions(): TreeRenderOptions {
  return laneTreeOptions({
    canvasClass: "vizardry-ost",
    wrapperClass: "vizardry-ost-wrapper",
    maxAddLevel: 3,
    lanes: [
      { label: t("ost.lane.outcome") },
      { label: t("ost.lane.opportunity") },
      { label: t("ost.lane.solution") },
      { label: t("ost.lane.experiment") },
    ],
    hueVars: [
      "var(--vzd-ost-outcome)",
      "var(--vzd-ost-opportunity)",
      "var(--vzd-ost-solution)",
      "var(--vzd-ost-experiment)",
    ],
  });
}

export const MINDMAP_OPTS: TreeRenderOptions = {
  nodeW: 180, nodeH: 40, levelGap: 70, siblingGap: 16,
  hPadding: 24, vPadding: 24, maxLabelChars: 24,
  direction: "right",
  canvasClass: "vizardry-mindmap",
  wrapperClass: "vizardry-mindmap-wrapper",
  levelStyles: [
    { fillVar: "var(--interactive-accent)", textVar: "var(--text-on-accent)", borderRadius: 10, dashed: false },
    { fillVar: "var(--background-modifier-hover)", textVar: "var(--text-normal)", borderRadius: 7, dashed: false, accentBar: true },
    { fillVar: "var(--background-secondary)", textVar: "var(--text-normal)", borderRadius: 5, dashed: false },
  ],
};

export const IMPACT_MAP_OPTS: TreeRenderOptions = {
  nodeW: 190, nodeH: 46, levelGap: 80, siblingGap: 20,
  hPadding: 24, vPadding: 24, maxLabelChars: 22,
  direction: "left",
  maxAddLevel: 3,
  canvasClass: "vizardry-impact",
  wrapperClass: "vizardry-impact-wrapper",
  levelStyles: [
    { fillVar: "var(--interactive-accent)", textVar: "var(--text-on-accent)", borderRadius: 10, dashed: false },
    { fillVar: "var(--background-modifier-hover)", textVar: "var(--text-normal)", borderRadius: 7, dashed: false, accentBar: true },
    { fillVar: "var(--background-secondary)", textVar: "var(--text-normal)", borderRadius: 6, dashed: false },
    { fillVar: "var(--background-secondary)", textVar: "var(--text-muted)", borderRadius: 20, dashed: true },
  ],
};

export const FISHBONE_OPTS: TreeRenderOptions = {
  nodeW: 190, nodeH: 46, levelGap: 80, siblingGap: 20,
  hPadding: 24, vPadding: 24, maxLabelChars: 22,
  direction: "left",
  maxAddLevel: 3,
  canvasClass: "vizardry-fishbone",
  wrapperClass: "vizardry-fishbone-wrapper",
  levelStyles: [
    { fillVar: "var(--interactive-accent)", textVar: "var(--text-on-accent)", borderRadius: 10, dashed: false },
    { fillVar: "var(--background-modifier-hover)", textVar: "var(--text-normal)", borderRadius: 7, dashed: false, accentBar: true },
    { fillVar: "var(--background-secondary)", textVar: "var(--text-normal)", borderRadius: 6, dashed: false },
    { fillVar: "var(--background-secondary)", textVar: "var(--text-muted)", borderRadius: 20, dashed: true },
  ],
};

// -- Domain -> TreeNode adapters ---------------------------------------------

// Only the Opportunity lane carries a caption; each of its keywords maps to a
// distinct one. Outcome/solution/experiment nodes show no italic caption.
const OST_CAPTION_KEYS: Record<string, TranslationKey> = {
  need: "ost.caption.need",
  pain: "ost.caption.pain",
  desire: "ost.caption.desire",
};

export function adaptOSTToTree(tree: OSTTree): { root: TreeNode } {
  const convert = (node: OSTNode): TreeNode => {
    const captionKey = OST_CAPTION_KEYS[node.key];
    return {
      text: node.text,
      level: node.level,
      key: node.key,
      sublabel: captionKey ? t(captionKey) : undefined,
      bullets: node.bullets,
      children: node.children.map(convert),
      x: 0, y: 0, width: 0, height: 0,
    };
  };
  return { root: convert(tree.root) };
}

export function adaptMindMapToTree(map: MindMap): { root: TreeNode } {
  const convert = (node: MindMapNode, level: number): TreeNode => ({
    text: node.text,
    level,
    sublabel: undefined,
    children: node.children.map(c => convert(c, level + 1)),
    x: 0, y: 0, width: 0, height: 0,
  });
  return { root: convert(map.root, 0) };
}

export function adaptImpactMapToTree(map: ImpactMap): { root: TreeNode } {
  const node = (text: string, level: number, sublabel: string, children: TreeNode[]): TreeNode => ({
    text, level, sublabel, children, x: 0, y: 0, width: 0, height: 0,
  });

  return {
    root: node(map.goal, 0, t("impact.level.goal"), map.actors.map(actor =>
      node(actor.name, 1, t("impact.level.actor"), actor.impacts.map(impact =>
        node(impact.name, 2, t("impact.level.impact"), impact.deliverables.map(d =>
          node(d, 3, t("impact.level.deliverable"), [])
        ))
      ))
    )),
  };
}

export function adaptFishboneToTree(diagram: FishboneDiagram): { root: TreeNode } {
  const node = (text: string, level: number, sublabel: string, children: TreeNode[]): TreeNode => ({
    text, level, sublabel, children, x: 0, y: 0, width: 0, height: 0,
  });

  return {
    root: node(diagram.effect, 0, t("fishbone.level.effect"), diagram.categories.map(cat =>
      node(cat.name, 1, t("fishbone.level.category"), cat.causes.map(cause =>
        node(cause.name, 2, t("fishbone.level.cause"), cause.subcauses.map(sc =>
          node(sc.name, 3, t("fishbone.level.subcause"), [])
        ))
      ))
    )),
  };
}

// -- SCQA / SCR ---------------------------------------------------------------
// Top-down narrative tree rendered in the shared swim-lane style. SCQA has 4
// lanes (situation → complication → question → answer); SCR collapses to 3
// (situation → complication → resolution). The role name is both the lane
// label and each box's italic caption.

const SCQA_LEVEL_KEYS: TranslationKey[] = [
  "scqa.level.situation",
  "scqa.level.complication",
  "scqa.level.question",
  "scqa.level.answer",
];

const SCR_LEVEL_KEYS: TranslationKey[] = [
  "scqa.level.situation",
  "scqa.level.complication",
  "scr.level.resolution",
];

function scqaLevelKeys(variant: SCQAData["variant"]): TranslationKey[] {
  return variant === "scqa" ? SCQA_LEVEL_KEYS : SCR_LEVEL_KEYS;
}

/** SCQA/SCR swim-lane options — one lane per narrative level, each with a
 *  theme-aware hue; lane labels reuse the role names. */
export function scqaTreeOptions(variant: SCQAData["variant"]): TreeRenderOptions {
  const keys = scqaLevelKeys(variant);
  const hueName = variant === "scqa"
    ? ["situation", "complication", "question", "answer"]
    : ["situation", "complication", "resolution"];
  return laneTreeOptions({
    canvasClass: "vizardry-scqa",
    wrapperClass: "vizardry-scqa-wrapper",
    maxAddLevel: variant === "scqa" ? 3 : 2,
    lanes: keys.map(k => ({ label: t(k) })),
    hueVars: hueName.map(h => `var(--vzd-scqa-${h})`),
  });
}

export function adaptSCQAToTree(data: SCQAData): { root: TreeNode } {
  const keys = scqaLevelKeys(data.variant);
  const convert = (node: SCQANode): TreeNode => ({
    text: node.text,
    level: node.level,
    key: node.key,
    sublabel: t(keys[Math.min(node.level, keys.length - 1)]),
    bullets: node.bullets,
    children: node.children.map(convert),
    x: 0, y: 0, width: 0, height: 0,
  });
  return { root: convert(data.root) };
}
