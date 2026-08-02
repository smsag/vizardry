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
import { Platform } from "obsidian";
import { createSvgEl } from "../shared/svg";
import { EMPTY_LABEL_PLACEHOLDER } from "../shared/keyword-tree";
import { wireRenameInputKeys, createBlurGuard } from "./inline-edit";
import { createTextMeasurer, wrapText, type TextMeasurer } from "../shared/text-wrap";
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
    height: String(node.height || opts.nodeH),
    rx: String(style.borderRadius),
    fill: style.accentBar ? "var(--background-secondary)" : style.fillVar,
    stroke: style.strokeVar ?? "var(--background-modifier-border)",
    "stroke-width": style.outline ? "1.5" : "1",
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

// ── Swim-lane layout (direction: "lanes") ───────────────────────────────────
// Every level is a horizontal band. Boxes wrap their text (variable height) and
// draw it as NATIVE SVG <text>/<tspan> — never foreignObject HTML, which iOS
// WebKit mispositions inside a transformed group (bullets teleporting to the
// canvas origin). Because the renderer emits exactly the lines the wrapper
// computes AND sizes the box to that count, a box can never clip its own text.
// Node → lane is the node's own level, so need/pain/desire (all level 1) share
// the Opportunity band.

// Box interior metrics (authoritative — the renderer draws to these).
const LANE_PAD_X = 14;
const LANE_PAD_TOP = 11;
const LANE_PAD_BOTTOM = 12;
const LANE_CAPTION_SIZE = 11;
const LANE_CAPTION_BASE = 11;   // baseline offset from the caption block top
const LANE_CAPTION_H = 17;      // caption line box incl. small gap below it
const LANE_LABEL_SIZE = 13.5;
const LANE_LABEL_BASE = 14;
const LANE_LABEL_LH = 19;
const LANE_BULLET_SIZE = 12.5;
const LANE_BULLET_BASE = 13;
const LANE_BULLET_LH = 18;
const LANE_BULLETS_TOP_GAP = 6;
const LANE_CHEVRON_INDENT = 15; // bullet text x-offset; the chevron sits at PAD_X
const LANE_ADD_BULLET_H = 18;   // "+ Add detail" row height (edit mode)

/** Pre-wrapped, laid-out content for one swim-lane node. Built once during
 *  layout (so height is exact) and reused by the renderer. */
interface LaneNodeModel {
  captionLines: string[];      // 0 or 1 line
  labelLines: string[];
  /** True when the node's label is empty and rendered as a faint placeholder. */
  isPlaceholder: boolean;
  bulletLines: string[][];     // per bullet, its wrapped lines
  showAddBullet: boolean;
  height: number;
}
const laneModels = new WeakMap<TreeNode, LaneNodeModel>();

function buildLaneModel(
  node: TreeNode, opts: TreeRenderOptions, measurer: TextMeasurer, showAddBullet: boolean,
): LaneNodeModel {
  const innerW = opts.nodeW - LANE_PAD_X * 2;
  const captionLines = (opts.captionPosition === "top" && node.sublabel) ? [node.sublabel] : [];
  const isPlaceholder = node.text.trim() === "";
  const labelLines = wrapText(
    isPlaceholder ? EMPTY_LABEL_PLACEHOLDER : node.text, innerW, s => measurer.width(s, LANE_LABEL_SIZE),
  );
  const bulletInnerW = innerW - LANE_CHEVRON_INDENT;
  const bulletLines = (node.bullets ?? []).map(
    b => wrapText(b, bulletInnerW, s => measurer.width(s, LANE_BULLET_SIZE)),
  );

  let h = LANE_PAD_TOP + LANE_PAD_BOTTOM;
  if (captionLines.length) h += LANE_CAPTION_H;
  h += labelLines.length * LANE_LABEL_LH;
  if (bulletLines.length > 0 || showAddBullet) {
    h += LANE_BULLETS_TOP_GAP;
    for (const bl of bulletLines) h += bl.length * LANE_BULLET_LH;
    if (showAddBullet) h += LANE_ADD_BULLET_H;
  }

  const model: LaneNodeModel = {
    captionLines, labelLines, isPlaceholder, bulletLines, showAddBullet,
    height: Math.max(opts.nodeH, h),
  };
  laneModels.set(node, model);
  return model;
}

/** Position siblings along X (depth-independent), keeping children centred
 *  under their parent. Y is assigned separately from the lane bands. */
function layoutXOnly(node: TreeNode, opts: TreeRenderOptions, left: number): number {
  node.width = opts.nodeW;
  if (node.children.length === 0) {
    node.x = left;
    return opts.nodeW;
  }
  const childWidths = node.children.map(c => layoutXOnly(c, opts, 0));
  const childSpan = childWidths.reduce((s, w) => s + w, 0) + opts.siblingGap * (node.children.length - 1);
  const width = Math.max(opts.nodeW, childSpan);
  node.x = left + (width - opts.nodeW) / 2;
  let cursor = left + (width - childSpan) / 2;
  for (let i = 0; i < node.children.length; i++) {
    layoutXOnly(node.children[i], opts, cursor);
    cursor += childWidths[i] + opts.siblingGap;
  }
  return width;
}

interface LaneLayout { bandTop: number[]; laneHeight: number[]; contentBottom: number; }

function layoutTreeNodeLanes(root: TreeNode, opts: TreeRenderOptions, showAddBullet: boolean): LaneLayout {
  const gutter = opts.gutterWidth ?? 0;
  const measurer = createTextMeasurer();

  // 1. Wrap + size every box (exact height from our own line count); track the
  //    tallest per lane.
  const laneHeight: number[] = [];
  const measure = (n: TreeNode): void => {
    n.width = opts.nodeW;
    n.height = buildLaneModel(n, opts, measurer, showAddBullet).height;
    laneHeight[n.level] = Math.max(laneHeight[n.level] ?? 0, n.height);
    n.children.forEach(measure);
  };
  measure(root);

  // 2. Stack the bands top-to-bottom.
  const bandTop: number[] = [];
  let y = opts.vPadding;
  for (let i = 0; i < laneHeight.length; i++) {
    const bh = laneHeight[i] ?? opts.nodeH;
    bandTop[i] = y;
    y += bh + opts.levelGap;
  }
  const contentBottom = y - opts.levelGap;

  // 3. X spread, then drop each node onto its lane's top edge.
  layoutXOnly(root, opts, opts.hPadding + gutter);
  const place = (n: TreeNode): void => { n.y = bandTop[n.level]; n.children.forEach(place); };
  place(root);

  return { bandTop, laneHeight, contentBottom };
}

/** Dashed dividers between lanes + left-gutter lane labels. */
function renderLaneBands(svg: SVGSVGElement, opts: TreeRenderOptions, layout: LaneLayout, svgW: number): void {
  const lanes = opts.lanes ?? [];
  for (let i = 0; i < layout.bandTop.length; i++) {
    const top = layout.bandTop[i];
    const bh = layout.laneHeight[i] ?? opts.nodeH;

    if (i > 0) {
      const dy = top - opts.levelGap / 2;
      svg.appendChild(createSvgEl("line", {
        x1: "0", y1: String(dy), x2: String(svgW), y2: String(dy),
        class: "vzd-lane-divider",
      }));
    }

    const lane = lanes[i];
    if (lane) {
      const label = createSvgEl("text", {
        x: String(opts.hPadding), y: String(top + bh / 2),
        "dominant-baseline": "middle", class: "vzd-lane-gutter-label",
      });
      label.textContent = lane.label;
      svg.appendChild(label);
    }
  }
}

function renderTreeEdges(
  node: TreeNode,
  svg: SVGSVGElement,
  opts: TreeRenderOptions,
  direction: "down" | "right" | "left" | "lanes",
): void {
  for (const child of node.children) {
    // Connectors flowing into a level take that level's colour, when set.
    const stroke = getTreeStyle(child.level, opts).strokeVar ?? "var(--background-modifier-border)";
    let d: string;
    if (direction === "down" || direction === "lanes") {
      const x1 = node.x + opts.nodeW / 2,  y1 = node.y + node.height;
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
      stroke,
      "stroke-width": "1.5",
    }));
    renderTreeEdges(child, svg, opts, direction);
  }
}

type RenameState = { fo: SVGForeignObjectElement | null };

type TreeDirection = "down" | "right" | "left" | "lanes";

/** "+" add-child button. Position depends on layout direction; omitted
 *  at/beyond maxAddLevel. Shared by the classic and wrap node paths. */
function renderAddButton(
  group: SVGGElement, node: TreeNode, opts: TreeRenderOptions,
  direction: TreeDirection, editHandlers: TreeEditHandlers, closeRename: () => void,
): void {
  if (!(opts.maxAddLevel === undefined || node.level < opts.maxAddLevel)) return;
  const h = node.height || opts.nodeH;
  const addBtnTransform = direction === "right"
    ? `translate(${opts.nodeW + 10}, ${h / 2})`
    : direction === "left"
      ? `translate(-10, ${h / 2})`
      : `translate(${opts.nodeW / 2}, ${h + 10})`;
  const addBtn = createSvgEl("g", {
    class: "vzd-tree-edit-add",
    transform: addBtnTransform,
    "aria-label": t("tree.addChild"),
  }) as SVGGElement;
  addBtn.appendChild(createSvgEl("circle", { cx: "0", cy: "0", r: "16", class: "vzd-tree-edit-add-hit" }));
  addBtn.appendChild(createSvgEl("circle", { cx: "0", cy: "0", r: "10", class: "vzd-tree-edit-add-circle" }));
  const plusText = createSvgEl("text", {
    x: "0", y: "0", "dominant-baseline": "middle", "text-anchor": "middle",
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

/** "×" delete button — top-right corner, only on leaf nodes. */
function renderDelButton(
  group: SVGGElement, node: TreeNode, opts: TreeRenderOptions,
  editHandlers: TreeEditHandlers, closeRename: () => void,
): void {
  if (node.children.length !== 0) return;
  const delBtn = createSvgEl("g", {
    class: "vzd-tree-edit-del",
    transform: `translate(${opts.nodeW - 5}, 5)`,
    "aria-label": t("tree.deleteNode"),
  }) as SVGGElement;
  delBtn.appendChild(createSvgEl("circle", { cx: "0", cy: "0", r: "7", class: "vzd-tree-edit-del-circle" }));
  const delText = createSvgEl("text", {
    x: "0", y: "0", "dominant-baseline": "middle", "text-anchor": "middle",
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

/** A multi-line SVG <text> anchored at (x, topY): one <tspan> per line, first
 *  line's baseline at topY + baseOffset, each subsequent line down lineHeight. */
function svgTextLines(
  lines: string[], x: number, topY: number, baseOffset: number, lineHeight: number,
  cls: string, fill?: string,
): SVGTextElement {
  const attrs: Record<string, string> = { x: String(x), y: String(topY + baseOffset), class: cls };
  if (fill) attrs.fill = fill;
  const text = createSvgEl("text", attrs) as SVGTextElement;
  lines.forEach((line, i) => {
    const tspanAttrs: Record<string, string> = { x: String(x) };
    if (i > 0) tspanAttrs.dy = String(lineHeight);
    const tspan = createSvgEl("tspan", tspanAttrs);
    tspan.textContent = line === "" ? " " : line;
    text.appendChild(tspan);
  });
  return text;
}

/** Opens a transient text input over an SVG region for rename / bullet edits.
 *  The foreignObject is appended to the SVG ROOT with absolute coordinates —
 *  never inside a transformed <g> — so iOS WebKit positions it correctly
 *  (the same pattern the classic tree rename uses). */
function openLaneInput(
  svg: SVGSVGElement, renameState: RenameState, closeRename: () => void,
  x: number, y: number, w: number, h: number, value: string, color: string,
  onCommit: (value: string) => void,
): void {
  closeRename();
  const fo = createSvgEl("foreignObject", {
    x: String(x), y: String(y), width: String(w), height: String(h), class: "vzd-tree-rename-fo",
  }) as SVGForeignObjectElement;
  const host = document.createElement("div");
  host.className = "vzd-tree-rename-host";
  const input = document.createElement("input");
  input.type = "text";
  input.value = value;
  input.className = "vzd-rename-input vzd-tree-rename-input";
  input.style.color = color;
  host.appendChild(input);
  fo.appendChild(host);
  svg.appendChild(fo);
  renameState.fo = fo;
  input.focus();
  input.select();

  const blurGuard = createBlurGuard();
  wireRenameInputKeys(input, (commit) => {
    blurGuard.dispose();
    closeRename();
    if (commit) onCommit(input.value.trim());
  }, { stopPropagation: true, ignoreBlur: blurGuard.ignoreBlur });
}

/** OST/SCQA swim-lane node, drawn entirely as native SVG (outlined box, italic
 *  caption, wrapped label, chevron bullet rows) — no foreignObject for content,
 *  so it renders correctly on every engine incl. iOS WebKit. Edit affordances:
 *  dblclick label/bullet → transient input overlay; per-bullet "×" and a
 *  "+ Add detail" row; plus the shared add-child / delete node buttons. */
function renderLaneNode(
  group: SVGGElement, node: TreeNode, opts: TreeRenderOptions, style: TreeNodeStyle,
  resolver: LinkResolver | undefined, navigateTo: ((h: string) => void) | undefined,
  editHandlers: TreeEditHandlers | undefined, svg: SVGSVGElement, renameState: RenameState,
  closeRename: () => void, direction: TreeDirection,
): void {
  const model = laneModels.get(node)
    ?? buildLaneModel(node, opts, createTextMeasurer(), !!editHandlers?.onAddBullet);
  const h = node.height || model.height;
  const textFill = style.textVar;
  const accent = style.strokeVar ?? "var(--text-muted)";
  const innerW = opts.nodeW - LANE_PAD_X * 2;

  const rectAttrs: Record<string, string> = {
    width: String(opts.nodeW), height: String(h), rx: String(style.borderRadius),
    fill: style.fillVar, stroke: style.strokeVar ?? "var(--background-modifier-border)",
    "stroke-width": "1.5", class: "vzd-lane-node-rect",
  };
  if (style.dashed) rectAttrs["stroke-dasharray"] = "6 3";
  group.appendChild(createSvgEl("rect", rectAttrs));

  const title = createSvgEl("title");
  title.textContent = node.text;
  group.appendChild(title);

  let top = LANE_PAD_TOP;

  if (model.captionLines.length) {
    group.appendChild(svgTextLines(
      model.captionLines, LANE_PAD_X, top, LANE_CAPTION_BASE, LANE_CAPTION_H, "vzd-lane-caption",
    ));
    top += LANE_CAPTION_H;
  }

  const labelTop = top;
  const labelText = svgTextLines(
    model.labelLines, LANE_PAD_X, top, LANE_LABEL_BASE, LANE_LABEL_LH, "vzd-lane-label-text", textFill,
  );
  if (model.isPlaceholder) labelText.classList.add("vzd-lane-label--placeholder");
  group.appendChild(labelText);
  top += model.labelLines.length * LANE_LABEL_LH;

  const heading = resolver?.resolve(node.text);
  if (heading && navigateTo) {
    labelText.classList.add("vzd-lane-label--linked");
    labelText.addEventListener("click", (e) => { e.stopPropagation(); navigateTo(heading); });
  }
  if (editHandlers) {
    labelText.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      openLaneInput(
        svg, renameState, closeRename,
        node.x + LANE_PAD_X - 2, node.y + labelTop, innerW + 4, model.labelLines.length * LANE_LABEL_LH + 4,
        node.text, textFill,
        (v) => { if (v && v !== node.text) editHandlers.onRename(node, v); },
      );
    });
  }

  if (model.bulletLines.length > 0 || model.showAddBullet) {
    top += LANE_BULLETS_TOP_GAP;
    const bulletX = LANE_PAD_X + LANE_CHEVRON_INDENT;
    const bulletW = opts.nodeW - LANE_PAD_X - bulletX;

    model.bulletLines.forEach((lines, bi) => {
      const rowTop = top;
      const rowH = lines.length * LANE_BULLET_LH;
      const bullet = node.bullets![bi];

      const chevron = createSvgEl("text", {
        x: String(LANE_PAD_X), y: String(rowTop + LANE_BULLET_BASE), class: "vzd-lane-chevron", fill: accent,
      });
      chevron.textContent = "›";
      group.appendChild(chevron);

      const bText = svgTextLines(
        lines, bulletX, rowTop, LANE_BULLET_BASE, LANE_BULLET_LH, "vzd-lane-bullet-text", textFill,
      );
      group.appendChild(bText);

      if (editHandlers?.onEditBullet) {
        bText.addEventListener("dblclick", (e) => {
          e.stopPropagation();
          openLaneInput(
            svg, renameState, closeRename,
            node.x + bulletX - 2, node.y + rowTop, bulletW + 4, rowH + 4, bullet, textFill,
            (v) => { if (v && v !== bullet) editHandlers.onEditBullet!(node, bullet, v); },
          );
        });
      }
      if (editHandlers?.onDeleteBullet) {
        const del = createSvgEl("g", {
          class: "vzd-lane-bullet-del",
          transform: `translate(${opts.nodeW - LANE_PAD_X}, ${rowTop + LANE_BULLET_BASE - 4})`,
          "aria-label": t("tree.deleteNode"),
        }) as SVGGElement;
        del.appendChild(createSvgEl("circle", { cx: "0", cy: "0", r: "8", class: "vzd-lane-bullet-del-hit" }));
        const dx = createSvgEl("text", {
          x: "0", y: "0", "dominant-baseline": "middle", "text-anchor": "middle", class: "vzd-lane-bullet-del-x",
        });
        dx.textContent = "×";
        del.appendChild(dx);
        del.addEventListener("click", (e) => {
          e.stopPropagation();
          closeRename();
          editHandlers.onDeleteBullet!(node, bullet);
        });
        group.appendChild(del);
      }
      top += rowH;
    });

    if (model.showAddBullet && editHandlers?.onAddBullet) {
      const addTop = top;
      const add = createSvgEl("text", {
        x: String(bulletX), y: String(addTop + LANE_BULLET_BASE), class: "vzd-lane-bullet-add",
      });
      add.textContent = `+ ${t("ost.addBullet")}`;
      add.addEventListener("click", (e) => {
        e.stopPropagation();
        openLaneInput(
          svg, renameState, closeRename,
          node.x + bulletX - 2, node.y + addTop, bulletW + 4, LANE_ADD_BULLET_H, "", textFill,
          (v) => { if (v) editHandlers.onAddBullet!(node, v); },
        );
      });
      group.appendChild(add);
      top += LANE_ADD_BULLET_H;
    }
  }

  if (editHandlers) {
    group.classList.add("vzd-tree-node--editable");
    renderAddButton(group, node, opts, direction, editHandlers, closeRename);
    renderDelButton(group, node, opts, editHandlers, closeRename);
  }
}

function renderTreeNodes(
  node: TreeNode,
  svg: SVGSVGElement,
  opts: TreeRenderOptions,
  resolver: LinkResolver | undefined,
  navigateTo: ((h: string) => void) | undefined,
  editHandlers: TreeEditHandlers | undefined,
  renameState: RenameState,
  closeRename: () => void,
  direction: TreeDirection = "down",
): void {
  const group = createSvgEl("g", { transform: `translate(${node.x}, ${node.y})` }) as SVGGElement;
  const style = getTreeStyle(node.level, opts);

  if (opts.wrap) {
    renderLaneNode(group, node, opts, style, resolver, navigateTo, editHandlers, svg, renameState, closeRename, direction);
    svg.appendChild(group);
    for (const child of node.children) {
      renderTreeNodes(child, svg, opts, resolver, navigateTo, editHandlers, renameState, closeRename, direction);
    }
    return;
  }

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
    renderAddButton(group, node, opts, direction, editHandlers, closeRename);
    renderDelButton(group, node, opts, editHandlers, closeRename);

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

      // Same CM6/Live Preview focus-steal guard as activateInlineEdit —
      // this input is mounted the same way (SVG foreignObject overlay,
      // .focus() called right after insertion).
      const blurGuard = createBlurGuard();
      wireRenameInputKeys(input, (commit) => {
        blurGuard.dispose();
        closeRename();
        const newText = input.value.trim();
        if (commit && newText && newText !== node.text) editHandlers.onRename(node, newText);
      }, { stopPropagation: true, ignoreBlur: blurGuard.ignoreBlur });
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
  const isLanes = direction === "lanes";

  // ── Layout ────────────────────────────────────────────────────────────────
  let laneLayout: LaneLayout | undefined;
  if (isLanes) {
    laneLayout = layoutTreeNodeLanes(tree.root, opts, !!editHandlers?.onAddBullet);
  } else if (isHorizontal) {
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
  } else if (isLanes && laneLayout) {
    svgW = bounds.maxX + opts.hPadding;
    svgH = laneLayout.contentBottom + opts.vPadding + (editHandlers ? 24 : 0);
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

  if (isLanes && laneLayout) renderLaneBands(svg, opts, laneLayout, svgW);
  renderTreeEdges(tree.root, svg, opts, direction);
  renderTreeNodes(tree.root, svg, opts, resolver, navigateTo, editHandlers, renameState, closeRename, direction);
  wrapper.appendChild(svg);
}

// -- Level-style configs -----------------------------------------------------
//
// Impact Map / Mind Map / Fishbone / SCQA share one visual language:
//   Level 0 -- accent fill (root / goal / outcome)
//   Level 1 -- hover-bg + left accent bar (main branches)
//   Level 2 -- secondary-bg, solid, r=6 (sub-branches)
//   Level 3 -- secondary-bg, dashed pill, muted text (leaves / hypotheses)
//
// OST and SCQA/SCR break away into the swim-lane style (see laneTreeOptions):
// outlined boxes coloured per lane, wrapped text, italic captions, chevron
// bullets. The shared factory below is the "boilerplate" both diagrams supply
// their own lane labels + hue variables to.

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
