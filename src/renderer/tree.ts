import type {
  FishboneDiagram,
  ImpactMap,
  MindMap,
  MindMapNode,
  OSTNode,
  OSTTree,
  SCQAData,
  SCQANode,
  TreeEditHandlers,
  TreeNode,
  TreeNodeStyle,
  TreeRenderOptions,
} from "../types";
import { createSvgEl } from "../shared/svg";
import { wireRenameInputKeys } from "./inline-edit";
import { t } from "../i18n";
import type { LinkResolver } from "../shared/links";
import type { TranslationKey } from "../i18n";


// Chain-link icon path drawn at 11x6px — appears on linked nodes.
// Two half-ovals connected by a horizontal bar (no emoji, pure SVG path).
const LINK_ICON_PATH = "M4 0.5H2.5C0.5 0.5 0.5 2 0.5 3C0.5 4 0.5 5.5 2.5 5.5H4 M7 0.5H8.5C10.5 0.5 10.5 2 10.5 3C10.5 4 10.5 5.5 8.5 5.5H7 M4 3H7";
const LINK_ICON_W = 11;
const LINK_ICON_H = 6;

function getTreeStyle(level: number, opts: TreeRenderOptions): TreeNodeStyle {
  return opts.levelStyles[Math.min(level, opts.levelStyles.length - 1)];
}

function renderTreeNodeRect(group: SVGGElement, node: TreeNode, opts: TreeRenderOptions): void {
  const style = getTreeStyle(node.level, opts);
  const rectAttrs: Record<string, string> = {
    width: String(opts.nodeW),
    height: String(opts.nodeH),
    rx: String(style.borderRadius),
    fill: style.accentBar ? "var(--background-secondary)" : style.fillVar,
    stroke: "var(--background-modifier-border)",
    "stroke-width": "1",
  };
  if (style.dashed) rectAttrs["stroke-dasharray"] = "6 3";
  group.appendChild(createSvgEl("rect", rectAttrs));

  if (style.accentBar) {
    group.appendChild(createSvgEl("rect", {
      x: "0", y: "0",
      width: "3",
      height: String(opts.nodeH),
      fill: "var(--interactive-accent)",
      rx: String(Math.min(3, style.borderRadius)),
    }));
  }
}

/** Top-down layout: depth → Y, siblings spread along X. */
function layoutTreeNode(node: TreeNode, opts: TreeRenderOptions): void {
  function layout(n: TreeNode, level: number, left: number): number {
    if (n.children.length === 0) {
      n.x = left;
      n.y = opts.vPadding + level * (opts.nodeH + opts.levelGap);
      n.width = opts.nodeW;
      n.height = opts.nodeH;
      return opts.nodeW;
    }

    const childWidths = n.children.map(c => layout(c, level + 1, 0));
    const childSpan = childWidths.reduce((s, w) => s + w, 0) + opts.siblingGap * (n.children.length - 1);
    const width = Math.max(opts.nodeW, childSpan);

    n.x = left + (width - opts.nodeW) / 2;
    n.y = opts.vPadding + level * (opts.nodeH + opts.levelGap);
    n.width = opts.nodeW;
    n.height = opts.nodeH;

    let cursor = left + (width - childSpan) / 2;
    for (let i = 0; i < n.children.length; i++) {
      layout(n.children[i], level + 1, cursor);
      cursor += childWidths[i] + opts.siblingGap;
    }
    return width;
  }
  layout(node, node.level, opts.hPadding);
}

/** Horizontal layout: depth → X, siblings spread along Y. Used for "right" and "left". */
function layoutTreeNodeH(node: TreeNode, opts: TreeRenderOptions): void {
  function layout(n: TreeNode, level: number, top: number): number {
    n.x = opts.hPadding + level * (opts.nodeW + opts.levelGap);
    n.width = opts.nodeW;
    n.height = opts.nodeH;

    if (n.children.length === 0) {
      n.y = top;
      return opts.nodeH;
    }

    const childHeights = n.children.map(c => layout(c, level + 1, 0));
    const childSpan = childHeights.reduce((s, h) => s + h, 0) + opts.siblingGap * (n.children.length - 1);
    const height = Math.max(opts.nodeH, childSpan);

    n.y = top + (height - opts.nodeH) / 2;

    let cursor = top + (height - childSpan) / 2;
    for (let i = 0; i < n.children.length; i++) {
      layout(n.children[i], level + 1, cursor);
      cursor += childHeights[i] + opts.siblingGap;
    }
    return height;
  }
  layout(node, node.level, opts.vPadding);
}

/** RTL post-pass: mirror every node's X so the root ends up on the right.
 *  extraLeft shifts all nodes right to make room for "+" buttons on leaf nodes. */
function mirrorTreeH(node: TreeNode, totalW: number, extraLeft: number): void {
  node.x = totalW - node.x - node.width + extraLeft;
  for (const child of node.children) mirrorTreeH(child, totalW, extraLeft);
}

function collectTreeBounds(node: TreeNode): { maxX: number; maxY: number } {
  const bounds = { maxX: node.x + node.width, maxY: node.y + node.height };
  for (const child of node.children) {
    const cb = collectTreeBounds(child);
    bounds.maxX = Math.max(bounds.maxX, cb.maxX);
    bounds.maxY = Math.max(bounds.maxY, cb.maxY);
  }
  return bounds;
}

function renderTreeEdges(
  node: TreeNode,
  svg: SVGSVGElement,
  opts: TreeRenderOptions,
  direction: "down" | "right" | "left",
): void {
  for (const child of node.children) {
    let d: string;
    if (direction === "down") {
      const x1 = node.x + opts.nodeW / 2,  y1 = node.y + opts.nodeH;
      const x2 = child.x + opts.nodeW / 2, y2 = child.y;
      const cy = (y1 + y2) / 2;
      d = `M ${x1} ${y1} C ${x1} ${cy}, ${x2} ${cy}, ${x2} ${y2}`;
    } else {
      // Horizontal: connect right edge of parent → left edge of child (LTR)
      // or left edge of parent → right edge of child (RTL, after mirror).
      const fromRight = direction === "right";
      const x1 = fromRight ? node.x + opts.nodeW : node.x;
      const y1 = node.y + opts.nodeH / 2;
      const x2 = fromRight ? child.x : child.x + opts.nodeW;
      const y2 = child.y + opts.nodeH / 2;
      const cx = (x1 + x2) / 2;
      d = `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`;
    }
    svg.appendChild(createSvgEl("path", {
      d,
      fill: "none",
      stroke: "var(--background-modifier-border)",
      "stroke-width": "1.5",
    }));
    renderTreeEdges(child, svg, opts, direction);
  }
}

type RenameState = { fo: SVGForeignObjectElement | null };

function renderTreeNodes(
  node: TreeNode,
  svg: SVGSVGElement,
  opts: TreeRenderOptions,
  resolver: LinkResolver | undefined,
  navigateTo: ((h: string) => void) | undefined,
  editHandlers: TreeEditHandlers | undefined,
  renameState: RenameState,
  closeRename: () => void,
  direction: "down" | "right" | "left" = "down",
): void {
  const group = createSvgEl("g", { transform: `translate(${node.x}, ${node.y})` }) as SVGGElement;
  const style = getTreeStyle(node.level, opts);
  renderTreeNodeRect(group, node, opts);

  const label = node.text.length > opts.maxLabelChars
    ? `${node.text.slice(0, opts.maxLabelChars - 1)}…`
    : node.text;

  // Main label — always vertically centred; sublabel sits in the corner independently
  const textEl = createSvgEl("text", {
    x: String(opts.nodeW / 2),
    y: String(opts.nodeH / 2),
    "dominant-baseline": "middle",
    "text-anchor": "middle",
    fill: style.textVar,
    class: "vzd-tree-text-main",
  });
  textEl.textContent = label;
  group.appendChild(textEl);

  // Sublabel — bottom-right corner, at 60% opacity of the node's main text colour
  if (node.sublabel) {
    const sublabelEl = createSvgEl("text", {
      x: String(opts.nodeW - 6),
      y: String(opts.nodeH - 4),
      "dominant-baseline": "auto",
      "text-anchor": "end",
      fill: style.textVar,
      opacity: "0.6",
      class: "vzd-tree-text-sub",
    });
    sublabelEl.textContent = node.sublabel;
    group.appendChild(sublabelEl);
  }

  const title = createSvgEl("title");
  title.textContent = node.text;
  group.appendChild(title);

  // Link affordance — full node click + chain-link icon in the right margin
  const heading = resolver?.resolve(node.text);
  if (heading && navigateTo) {
    group.setAttribute("data-linked", "true");
    group.classList.add("vzd-tree-node--linked");
    group.addEventListener("click", (e) => {
      e.stopPropagation();
      navigateTo(heading);
    });

    // Chain-link icon: right-aligned, vertically centred in the node
    const iconG = createSvgEl("g", {
      transform: `translate(${opts.nodeW - LINK_ICON_W - 5}, ${(opts.nodeH - LINK_ICON_H) / 2})`,
      class: "vzd-tree-link-icon",
      "aria-hidden": "true",
    });
    iconG.appendChild(createSvgEl("path", {
      d: LINK_ICON_PATH,
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1.2",
      "stroke-linecap": "round",
    }));
    group.appendChild(iconG);
  }

  // ── Edit interactions ────────────────────────────────────────────────────────
  if (editHandlers) {
    group.classList.add("vzd-tree-node--editable");

    // "+" button: position depends on layout direction; omitted at/beyond maxAddLevel
    if (opts.maxAddLevel === undefined || node.level < opts.maxAddLevel) {
      const addBtnTransform = direction === "right"
        ? `translate(${opts.nodeW + 10}, ${opts.nodeH / 2})`
        : direction === "left"
          ? `translate(-10, ${opts.nodeH / 2})`
          : `translate(${opts.nodeW / 2}, ${opts.nodeH + 10})`;
      const addBtn = createSvgEl("g", {
        class: "vzd-tree-edit-add",
        transform: addBtnTransform,
        "aria-label": t("tree.addChild"),
      }) as SVGGElement;
      addBtn.appendChild(createSvgEl("circle", { cx: "0", cy: "0", r: "16", class: "vzd-tree-edit-add-hit" }));
      addBtn.appendChild(createSvgEl("circle", { cx: "0", cy: "0", r: "10", class: "vzd-tree-edit-add-circle" }));
      const plusText = createSvgEl("text", {
        x: "0", y: "0",
        "dominant-baseline": "middle",
        "text-anchor": "middle",
        class: "vzd-tree-edit-add-plus",
      });
      plusText.textContent = "+";
      addBtn.appendChild(plusText);
      group.appendChild(addBtn);

      addBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        closeRename();
        editHandlers.onAddChild(node);
      });
    }

    // "×" button: top-right corner, only on leaf nodes — deletes the node
    if (node.children.length === 0) {
      const delBtn = createSvgEl("g", {
        class: "vzd-tree-edit-del",
        transform: `translate(${opts.nodeW - 5}, 5)`,
        "aria-label": t("tree.deleteNode"),
      }) as SVGGElement;
      delBtn.appendChild(createSvgEl("circle", { cx: "0", cy: "0", r: "7", class: "vzd-tree-edit-del-circle" }));
      const delText = createSvgEl("text", {
        x: "0", y: "0",
        "dominant-baseline": "middle",
        "text-anchor": "middle",
        class: "vzd-tree-edit-del-x",
      });
      delText.textContent = "×";
      delBtn.appendChild(delText);
      group.appendChild(delBtn);

      delBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        closeRename();
        editHandlers.onDelete(node);
      });
    }

    // Double-click to rename: show inline foreignObject input over the node
    group.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      closeRename();

      const fo = createSvgEl("foreignObject", {
        x: String(node.x),
        y: String(node.y),
        width: String(opts.nodeW),
        height: String(opts.nodeH),
        class: "vzd-tree-rename-fo",
      }) as SVGForeignObjectElement;

      const host = document.createElement("div");
      host.className = "vzd-tree-rename-host";

      const input = document.createElement("input");
      input.type = "text";
      input.value = node.text;
      input.className = "vzd-rename-input vzd-tree-rename-input";
      // Match the node's own label colour — the input has a transparent
      // background, so on accent-filled nodes (e.g. root) it must use
      // text-on-accent rather than the default text colour to stay legible.
      input.style.color = style.textVar;
      host.appendChild(input);
      fo.appendChild(host);
      svg.appendChild(fo);
      renameState.fo = fo;

      input.focus();
      input.select();

      wireRenameInputKeys(input, (commit) => {
        closeRename();
        const newText = input.value.trim();
        if (commit && newText && newText !== node.text) editHandlers.onRename(node, newText);
      }, { stopPropagation: true });
    });
  }

  svg.appendChild(group);

  for (const child of node.children) {
    renderTreeNodes(child, svg, opts, resolver, navigateTo, editHandlers, renameState, closeRename, direction);
  }
}

// INVARIANT: renderTree mutates TreeNode.x/y/width/height in place during layout.
// The adapter functions (adaptOSTToTree etc.) always create fresh TreeNode objects,
// so this is safe. Do not cache or reuse a TreeNode tree across two renderTree calls --
// the second call will inherit stale layout coordinates from the first.
export function renderTree(
  tree: { root: TreeNode },
  opts: TreeRenderOptions,
  el: HTMLElement,
  resolver?: LinkResolver,
  navigateTo?: (heading: string) => void,
  editHandlers?: TreeEditHandlers,
): void {
  const direction = opts.direction ?? "down";
  const isHorizontal = direction === "right" || direction === "left";

  // ── Layout ────────────────────────────────────────────────────────────────
  if (isHorizontal) {
    layoutTreeNodeH(tree.root, opts);
    if (direction === "left") {
      const preMirror = collectTreeBounds(tree.root);
      // extraLeft reserves space for "+" buttons on the leftmost (deepest) nodes
      const extraLeft = editHandlers ? 32 : 0;
      mirrorTreeH(tree.root, preMirror.maxX + opts.hPadding, extraLeft);
    }
  } else {
    layoutTreeNode(tree.root, opts);
  }

  // ── Canvas size ───────────────────────────────────────────────────────────
  const bounds = collectTreeBounds(tree.root);
  let svgW: number, svgH: number;
  if (isHorizontal) {
    // Extra right padding for "right" direction (room for "+" buttons on leaf nodes)
    svgW = bounds.maxX + opts.hPadding + (direction === "right" && editHandlers ? 32 : 0);
    svgH = bounds.maxY + opts.vPadding;
  } else {
    svgW = bounds.maxX + opts.hPadding;
    // Extra bottom padding for "+" buttons below leaf nodes
    svgH = bounds.maxY + opts.vPadding + (editHandlers ? 24 : 0);
  }

  const wrapper = el.createEl("div", { cls: opts.wrapperClass });
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg") as SVGSVGElement;
  svg.setAttribute("width", String(svgW));
  svg.setAttribute("height", String(svgH));
  svg.setAttribute("viewBox", `0 0 ${svgW} ${svgH}`);
  svg.setAttribute("class", opts.canvasClass);
  if (editHandlers) svg.classList.add("vzd-tree--editable");

  const renameState: RenameState = { fo: null };
  const closeRename = (): void => { renameState.fo?.remove(); renameState.fo = null; };

  // Clicking the SVG background dismisses any open inline rename
  svg.addEventListener("click", closeRename);

  renderTreeEdges(tree.root, svg, opts, direction);
  renderTreeNodes(tree.root, svg, opts, resolver, navigateTo, editHandlers, renameState, closeRename, direction);
  wrapper.appendChild(svg);
}

// -- Level-style configs -----------------------------------------------------
//
// OST and Impact Map share the same visual language:
//   Level 0 -- accent fill (root / goal / outcome)
//   Level 1 -- hover-bg + left accent bar (main branches)
//   Level 2 -- secondary-bg, solid, r=6 (sub-branches)
//   Level 3 -- secondary-bg, dashed pill, muted text (leaves / hypotheses)
//
// Dimensions are unified at 190x46 so both diagrams feel like one system.

export const OST_TREE_OPTIONS: TreeRenderOptions = {
  nodeW: 190, nodeH: 46, levelGap: 80, siblingGap: 20,
  hPadding: 24, vPadding: 24, maxLabelChars: 22,
  maxAddLevel: 4,
  canvasClass: "vizardry-ost",
  wrapperClass: "vizardry-ost-wrapper",
  levelStyles: [
    { fillVar: "var(--interactive-accent)", textVar: "var(--text-on-accent)", borderRadius: 10, dashed: false },
    { fillVar: "var(--background-modifier-hover)", textVar: "var(--text-normal)", borderRadius: 7, dashed: false, accentBar: true },
    { fillVar: "var(--background-secondary)", textVar: "var(--text-normal)", borderRadius: 6, dashed: false },
    { fillVar: "var(--background-secondary)", textVar: "var(--text-muted)", borderRadius: 20, dashed: true },
    { fillVar: "var(--background-secondary)", textVar: "var(--text-muted)", borderRadius: 6, dashed: true },
  ],
};

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

const OST_LEVEL_KEYS: TranslationKey[] = [
  "ost.level.outcome",
  "ost.level.opportunity",
  "ost.level.solution",
  "ost.level.experiment",
  "ost.level.assumption",
];

export function adaptOSTToTree(tree: OSTTree): { root: TreeNode } {
  const convert = (node: OSTNode): TreeNode => ({
    text: node.text,
    level: node.level,
    sublabel: t(OST_LEVEL_KEYS[Math.min(node.level, OST_LEVEL_KEYS.length - 1)]),
    children: node.children.map(convert),
    x: 0, y: 0, width: 0, height: 0,
  });
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
// Top-down narrative tree. SCQA has 4 levels (situation → complication →
// question → answer); SCR collapses to 3 (situation → complication →
// resolution). Shares the OST/Impact visual language.

export const SCQA_TREE_OPTIONS: TreeRenderOptions = {
  nodeW: 190, nodeH: 46, levelGap: 80, siblingGap: 20,
  hPadding: 24, vPadding: 24, maxLabelChars: 22,
  maxAddLevel: 3,
  canvasClass: "vizardry-scqa",
  wrapperClass: "vizardry-scqa-wrapper",
  levelStyles: [
    { fillVar: "var(--interactive-accent)", textVar: "var(--text-on-accent)", borderRadius: 10, dashed: false },
    { fillVar: "var(--background-modifier-hover)", textVar: "var(--text-normal)", borderRadius: 7, dashed: false, accentBar: true },
    { fillVar: "var(--background-secondary)", textVar: "var(--text-normal)", borderRadius: 6, dashed: false },
    { fillVar: "var(--background-secondary)", textVar: "var(--text-muted)", borderRadius: 20, dashed: true },
  ],
};

export const SCR_TREE_OPTIONS: TreeRenderOptions = {
  ...SCQA_TREE_OPTIONS,
  maxAddLevel: 2,
};

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

export function adaptSCQAToTree(data: SCQAData): { root: TreeNode } {
  const keys = data.variant === "scqa" ? SCQA_LEVEL_KEYS : SCR_LEVEL_KEYS;
  const convert = (node: SCQANode): TreeNode => ({
    text: node.text,
    level: node.level,
    sublabel: t(keys[Math.min(node.level, keys.length - 1)]),
    children: node.children.map(convert),
    x: 0, y: 0, width: 0, height: 0,
  });
  return { root: convert(data.root) };
}
