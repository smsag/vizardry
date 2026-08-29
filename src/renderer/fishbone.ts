import type { FishboneDiagram } from "../types";
import type { RenderContext } from "./render-context";
import { initCanvas, renderCanvasWarnings } from "./controls";
import { parseTitle, writeCanvasTitle } from "../shared/title-edit";
import { isEditModeActive } from "../shared/editor";
import { createSvgEl } from "../shared/svg";
import { harmonizedAccentColor } from "../shared/accent-colors";
import { NULL_RESOLVER } from "../shared/links";
import type { LinkResolver } from "../shared/links";
import { wireRenameInputKeys, createBlurGuard } from "./inline-edit";
import {
  renameKeywordTreeNode, addKeywordTreeChild, deleteKeywordTreeNode,
} from "../shared/keyword-tree-edit";
import type { KeywordTreeConfig } from "../shared/keyword-tree-edit";
import { t } from "../i18n";
import { layoutFishbone } from "./fishbone-geometry";
import type { FBCategory, FBCause } from "./fishbone-geometry";

const FISHBONE_CONFIG: KeywordTreeConfig = {
  levelKeyword: { 0: "effect", 1: "category", 2: "cause", 3: "subcause" },
};

export function renderFishbone(
  diagram: FishboneDiagram,
  container: HTMLElement,
  rc: RenderContext = {},
): void {
  const { app, ctx, source, navigateTo } = rc;
  const resolver = rc.resolver ?? NULL_RESOLVER;
  const isEditMode = !!(app && ctx && isEditModeActive(app));
  const defaultTitle = "Fishbone Diagram";
  const title = source !== undefined ? parseTitle(source, defaultTitle) : defaultTitle;
  const onTitleEdit = (isEditMode && source !== undefined)
    ? (newTitle: string) => writeCanvasTitle(app!, ctx!, container, newTitle, defaultTitle)
    : undefined;
  initCanvas(container, "fishbone", title, undefined, source, onTitleEdit, app, ctx);
  renderCanvasWarnings(container, diagram.warnings);

  const layout = layoutFishbone(diagram);
  const color = (i: number): string => harmonizedAccentColor(i, layout.colorCount);

  const wrapper = container.createEl("div", { cls: "vzd-fishbone-wrap" });
  const svg = createSvgEl("svg", {
    width: String(layout.width),
    height: String(layout.height),
    viewBox: `0 0 ${layout.width} ${layout.height}`,
    class: "vzd-fishbone-svg",
    role: "img",
    "aria-label": `Fishbone: ${diagram.effect}`,
  }) as SVGSVGElement;
  if (isEditMode) svg.classList.add("vzd-tree--editable");

  // ── Inline-edit plumbing (rename overlay + source mutators) ──────────────────
  let renameFo: SVGForeignObjectElement | null = null;
  const closeRename = (): void => { renameFo?.remove(); renameFo = null; };
  svg.addEventListener("click", closeRename);

  const notifyFail = (ok: boolean): void => { if (!ok) showWriteFailedNotice(container); };
  const doRename = (level: number, oldText: string, newText: string): void =>
    notifyFail(renameKeywordTreeNode(app!, ctx!, container, FISHBONE_CONFIG, level, oldText, newText));
  const doAddChild = (level: number, parentText: string): void =>
    notifyFail(addKeywordTreeChild(app!, ctx!, container, FISHBONE_CONFIG, level, parentText, t("tree.newNode")));
  const doDelete = (level: number, text: string): void =>
    notifyFail(deleteKeywordTreeNode(app!, ctx!, container, FISHBONE_CONFIG, level, text));

  const openRename = (
    x: number, y: number, w: number, h: number, value: string, cssColor: string,
    onCommit: (v: string) => void,
  ): void => {
    closeRename();
    const fo = createSvgEl("foreignObject", {
      x: String(x), y: String(y), width: String(Math.max(60, w)), height: String(h), class: "vzd-tree-rename-fo",
    }) as SVGForeignObjectElement;
    const host = document.createElement("div");
    host.className = "vzd-tree-rename-host";
    const input = document.createElement("input");
    input.type = "text";
    input.value = value;
    input.className = "vzd-rename-input vzd-tree-rename-input";
    input.style.color = cssColor;
    host.appendChild(input);
    fo.appendChild(host);
    svg.appendChild(fo);
    renameFo = fo;
    input.focus({ preventScroll: true });
    input.select();
    const guard = createBlurGuard();
    wireRenameInputKeys(input, (commit) => {
      guard.dispose();
      closeRename();
      const v = input.value.trim();
      if (commit && v && v !== value) onCommit(v);
    }, { stopPropagation: true, ignoreBlur: guard.ignoreBlur });
  };

  // ── Spine + arrow into the head ──────────────────────────────────────────────
  const { spine, head } = layout;
  svg.appendChild(createSvgEl("line", {
    x1: String(spine.x1), y1: String(spine.y1), x2: String(spine.x2), y2: String(spine.y2), class: "vzd-fb-spine",
  }));
  svg.appendChild(createSvgEl("path", {
    d: `M ${spine.x2 - 2} ${spine.y2 - 9} L ${head.x + 3} ${spine.y2} L ${spine.x2 - 2} ${spine.y2 + 9} Z`,
    class: "vzd-fb-arrow",
  }));

  // ── Effect head (accent-filled, pointed) ─────────────────────────────────────
  const headG = createSvgEl("g", {}) as SVGGElement;
  headG.appendChild(createSvgEl("path", {
    d: `M ${head.x} ${head.y} L ${head.x + head.w} ${head.y} L ${head.x + head.w + head.nose} ${head.y + head.h / 2} L ${head.x + head.w} ${head.y + head.h} L ${head.x} ${head.y + head.h} Z`,
    class: "vzd-fb-head",
  }));
  const headText = multilineText(
    head.lines, head.x + head.w / 2 + head.nose / 3, head.y + head.h / 2, head.lines.length, 20,
    "vzd-fb-head-label", "middle",
  );
  headG.appendChild(headText);
  svg.appendChild(headG);
  applyLink(headText, diagram.effect, resolver, navigateTo);
  if (isEditMode) {
    headText.classList.add("vzd-fb-editable");
    headText.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      openRename(head.x, head.y + head.h / 2 - 14, head.w, 28, diagram.effect, "var(--text-on-accent)",
        (v) => doRename(0, diagram.effect, v));
    });
    drawAddButton(svg, head.x + head.w / 2, head.y + head.h + 4, () => { closeRename(); doAddChild(0, diagram.effect); });
  }

  // ── Category bones ───────────────────────────────────────────────────────────
  for (const cat of layout.categories) {
    renderCategory(svg, cat, color(cat.colorIndex), diagram, resolver, navigateTo, isEditMode, {
      openRename, doRename, doAddChild, doDelete, closeRename,
    });
  }

  wrapper.appendChild(svg);
}

interface EditOps {
  openRename: (x: number, y: number, w: number, h: number, value: string, cssColor: string, onCommit: (v: string) => void) => void;
  doRename: (level: number, oldText: string, newText: string) => void;
  doAddChild: (level: number, parentText: string) => void;
  doDelete: (level: number, text: string) => void;
  closeRename: () => void;
}

function renderCategory(
  svg: SVGSVGElement, cat: FBCategory, col: string, diagram: FishboneDiagram,
  resolver: LinkResolver, navigateTo: ((h: string) => void) | undefined,
  editMode: boolean, ops: EditOps,
): void {
  // Rib.
  svg.appendChild(createSvgEl("line", {
    x1: String(cat.rib.x1), y1: String(cat.rib.y1), x2: String(cat.rib.x2), y2: String(cat.rib.y2),
    class: "vzd-fb-rib", stroke: col,
  }));

  // Category box (accent-filled with its harmonised hue).
  const { box } = cat;
  svg.appendChild(createSvgEl("rect", {
    x: String(box.x), y: String(box.y), width: String(box.w), height: String(box.h), rx: "8", fill: col, class: "vzd-fb-catbox",
  }));
  const catLabel = createSvgEl("text", {
    x: String(box.x + box.w / 2), y: String(box.y + box.h / 2), "dominant-baseline": "middle",
    "text-anchor": "middle", class: "vzd-fb-cat-label", fill: "var(--text-on-accent)",
  });
  catLabel.textContent = cat.name;
  svg.appendChild(catLabel);

  if (editMode) {
    catLabel.classList.add("vzd-fb-editable");
    catLabel.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      ops.openRename(box.x, box.y + 1, box.w, box.h - 2, cat.name, "var(--text-on-accent)",
        (v) => ops.doRename(1, cat.name, v));
    });
    drawDelButton(svg, box.x + box.w - 3, box.y + 3, () => { ops.closeRename(); ops.doDelete(1, cat.name); });
    drawAddButton(svg, box.x + box.w + 10, box.y + box.h / 2, () => { ops.closeRename(); ops.doAddChild(1, cat.name); });
  }

  // Causes along the rib.
  for (const cause of cat.causes) {
    renderCause(svg, cause, col, resolver, navigateTo, editMode, ops);
  }
}

function renderCause(
  svg: SVGSVGElement, cause: FBCause, col: string,
  resolver: LinkResolver, navigateTo: ((h: string) => void) | undefined,
  editMode: boolean, ops: EditOps,
): void {
  svg.appendChild(createSvgEl("line", {
    x1: String(cause.stub.x1), y1: String(cause.stub.y1), x2: String(cause.stub.x2), y2: String(cause.stub.y2),
    class: "vzd-fb-cause-stub", stroke: col,
  }));
  const label = createSvgEl("text", {
    x: String(cause.labelX), y: String(cause.labelY), class: "vzd-fb-cause-label",
  });
  label.textContent = cause.text;
  svg.appendChild(label);
  applyLink(label, cause.text, resolver, navigateTo);

  const approxW = cause.text.length * 6.4;
  if (editMode) {
    label.classList.add("vzd-fb-editable");
    label.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      ops.openRename(cause.labelX - 2, cause.labelY - 14, approxW + 20, 20, cause.text, "var(--text-normal)",
        (v) => ops.doRename(2, cause.text, v));
    });
    drawDelButton(svg, cause.labelX + approxW + 8, cause.labelY - 5, () => { ops.closeRename(); ops.doDelete(2, cause.text); });
    drawAddButton(svg, cause.labelX + approxW + 26, cause.labelY - 5, () => { ops.closeRename(); ops.doAddChild(2, cause.text); }, true);
  }

  for (const sub of cause.subs) {
    const subText = createSvgEl("text", { x: String(sub.x), y: String(sub.y), class: "vzd-fb-sub-label" });
    subText.textContent = `› ${sub.text}`;
    svg.appendChild(subText);
    if (editMode) {
      subText.classList.add("vzd-fb-editable");
      subText.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        ops.openRename(sub.x, sub.y - 12, sub.text.length * 6 + 24, 18, sub.text, "var(--text-muted)",
          (v) => ops.doRename(3, sub.text, v));
      });
      drawDelButton(svg, sub.x + sub.text.length * 5.8 + 14, sub.y - 4, () => { ops.closeRename(); ops.doDelete(3, sub.text); });
    }
  }
}

// ── Shared bits ────────────────────────────────────────────────────────────────

function applyLink(
  el: SVGTextElement, text: string, resolver: LinkResolver, navigateTo: ((h: string) => void) | undefined,
): void {
  const heading = resolver.resolve(text);
  if (heading && navigateTo) {
    el.classList.add("vzd-fb-linked");
    el.addEventListener("click", (e) => { e.stopPropagation(); navigateTo(heading); });
  }
}

function multilineText(
  lines: string[], cx: number, cy: number, count: number, lh: number, cls: string, anchor: string,
): SVGTextElement {
  const top = cy - ((count - 1) * lh) / 2;
  const text = createSvgEl("text", {
    x: String(cx), y: String(top), "text-anchor": anchor, "dominant-baseline": "middle", class: cls,
  }) as SVGTextElement;
  lines.forEach((line, i) => {
    const tspan = createSvgEl("tspan", { x: String(cx), ...(i > 0 ? { dy: String(lh) } : {}) });
    tspan.textContent = line === "" ? " " : line;
    text.appendChild(tspan);
  });
  return text;
}

function drawAddButton(svg: SVGSVGElement, x: number, y: number, onClick: () => void, small = false): void {
  const g = createSvgEl("g", { class: "vzd-tree-edit-add", transform: `translate(${x}, ${y})`, "aria-label": t("tree.addChild") }) as SVGGElement;
  g.appendChild(createSvgEl("circle", { cx: "0", cy: "0", r: "14", class: "vzd-tree-edit-add-hit" }));
  g.appendChild(createSvgEl("circle", { cx: "0", cy: "0", r: small ? "8" : "10", class: "vzd-tree-edit-add-circle" }));
  const plus = createSvgEl("text", { x: "0", y: "0", "dominant-baseline": "middle", "text-anchor": "middle", class: "vzd-tree-edit-add-plus" });
  plus.textContent = "+";
  g.appendChild(plus);
  g.addEventListener("click", (e) => { e.stopPropagation(); onClick(); });
  svg.appendChild(g);
}

function drawDelButton(svg: SVGSVGElement, x: number, y: number, onClick: () => void): void {
  const g = createSvgEl("g", { class: "vzd-tree-edit-del", transform: `translate(${x}, ${y})`, "aria-label": t("tree.deleteNode") }) as SVGGElement;
  g.appendChild(createSvgEl("circle", { cx: "0", cy: "0", r: "7", class: "vzd-tree-edit-del-circle" }));
  const x2 = createSvgEl("text", { x: "0", y: "0", "dominant-baseline": "middle", "text-anchor": "middle", class: "vzd-tree-edit-del-x" });
  x2.textContent = "×";
  g.appendChild(x2);
  g.addEventListener("click", (e) => { e.stopPropagation(); onClick(); });
  svg.appendChild(g);
}

function showWriteFailedNotice(container: HTMLElement): void {
  const notice = container.createEl("div", { cls: "vzd-tree-write-notice", text: t("tree.writeFailed") });
  setTimeout(() => notice.remove(), 3000);
}
