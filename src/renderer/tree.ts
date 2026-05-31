import type {
  ImpactMap,
  MindMap,
  MindMapNode,
  OSTNode,
  OSTTree,
  TreeNode,
  TreeNodeStyle,
  TreeRenderOptions,
} from "../types";
import { createSvgEl } from "../shared/svg";
import { t } from "../i18n";
import type { TranslationKey } from "../i18n";

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

function collectTreeBounds(node: TreeNode): { maxX: number; maxY: number } {
  const bounds = { maxX: node.x + node.width, maxY: node.y + node.height };
  for (const child of node.children) {
    const cb = collectTreeBounds(child);
    bounds.maxX = Math.max(bounds.maxX, cb.maxX);
    bounds.maxY = Math.max(bounds.maxY, cb.maxY);
  }
  return bounds;
}

function renderTreeEdges(node: TreeNode, svg: SVGSVGElement, opts: TreeRenderOptions): void {
  for (const child of node.children) {
    const x1 = node.x + opts.nodeW / 2, y1 = node.y + opts.nodeH;
    const x2 = child.x + opts.nodeW / 2, y2 = child.y;
    const cy = (y1 + y2) / 2;
    svg.appendChild(createSvgEl("path", {
      d: `M ${x1} ${y1} C ${x1} ${cy}, ${x2} ${cy}, ${x2} ${y2}`,
      fill: "none",
      stroke: "var(--background-modifier-border)",
      "stroke-width": "1.5",
    }));
    renderTreeEdges(child, svg, opts);
  }
}

function renderTreeNodes(node: TreeNode, svg: SVGSVGElement, opts: TreeRenderOptions): void {
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

  // Sublabel — bottom-right corner, smaller and faint
  if (node.sublabel) {
    const sublabelEl = createSvgEl("text", {
      x: String(opts.nodeW - 6),
      y: String(opts.nodeH - 4),
      "dominant-baseline": "auto",
      "text-anchor": "end",
      fill: "var(--text-faint)",
      class: "vzd-tree-text-sub",
    });
    sublabelEl.textContent = node.sublabel;
    group.appendChild(sublabelEl);
  }

  const title = createSvgEl("title");
  title.textContent = node.text;
  group.appendChild(title);

  svg.appendChild(group);

  for (const child of node.children) renderTreeNodes(child, svg, opts);
}

// INVARIANT: renderTree mutates TreeNode.x/y/width/height in place during layout.
// The adapter functions (adaptOSTToTree etc.) always create fresh TreeNode objects,
// so this is safe. Do not cache or reuse a TreeNode tree across two renderTree calls --
// the second call will inherit stale layout coordinates from the first.
export function renderTree(tree: { root: TreeNode }, opts: TreeRenderOptions, el: HTMLElement): void {
  layoutTreeNode(tree.root, opts);
  const bounds = collectTreeBounds(tree.root);
  const svgW = bounds.maxX + opts.hPadding;
  const svgH = bounds.maxY + opts.vPadding;

  const wrapper = el.createEl("div", { cls: opts.wrapperClass });
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg") as SVGSVGElement;
  svg.setAttribute("width", String(svgW));
  svg.setAttribute("height", String(svgH));
  svg.setAttribute("viewBox", `0 0 ${svgW} ${svgH}`);
  svg.setAttribute("class", opts.canvasClass);

  renderTreeEdges(tree.root, svg, opts);
  renderTreeNodes(tree.root, svg, opts);
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
  canvasClass: "vizardry-ost",
  wrapperClass: "vizardry-ost-wrapper",
  levelStyles: [
    { fillVar: "var(--interactive-accent)", textVar: "var(--text-on-accent)", borderRadius: 10, dashed: false },
    { fillVar: "var(--background-modifier-hover)", textVar: "var(--text-normal)", borderRadius: 8, dashed: false, accentBar: true },
    { fillVar: "var(--background-secondary)", textVar: "var(--text-normal)", borderRadius: 6, dashed: false },
    { fillVar: "var(--background-secondary)", textVar: "var(--text-muted)", borderRadius: 20, dashed: true },
    { fillVar: "var(--background-secondary)", textVar: "var(--text-muted)", borderRadius: 6, dashed: true },
  ],
};

export const MINDMAP_OPTS: TreeRenderOptions = {
  nodeW: 180, nodeH: 40, levelGap: 70, siblingGap: 16,
  hPadding: 24, vPadding: 24, maxLabelChars: 24,
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
  canvasClass: "vizardry-impact",
  wrapperClass: "vizardry-impact-wrapper",
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
