import { VennDiagram, VennItem } from "../types";
import { initCanvas, markInteractive } from "./controls";

export function renderVennDiagram(
  venn: VennDiagram,
  container: HTMLElement,
  openLink: (target: string) => void
): void {
  initCanvas(container, "venn", "Venn Diagram");

  const wrap = container.createEl("div", { cls: "vzd-venn-wrap" });
  const is3 = venn.circles.length === 3;

  function makeSvg(tag: string, attrs: Record<string, string>): SVGElement {
    const el = document.createElementNS("http://www.w3.org/2000/svg", tag) as SVGElement;
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  }

  const svg = makeSvg("svg", {
    viewBox: is3 ? "0 0 500 460" : "0 0 500 300",
    class: "vzd-venn-svg",
  });

  type CircleGeo = { cx: number; cy: number; r: number; lx: number; ly: number };
  const geos: CircleGeo[] = is3
    ? [
        { cx: 250, cy: 165, r: 140, lx: 250, ly: 38  },
        { cx: 338, cy: 315, r: 140, lx: 422, ly: 322 },
        { cx: 162, cy: 315, r: 140, lx: 78,  ly: 322 },
      ]
    : [
        { cx: 175, cy: 150, r: 130, lx: 128, ly: 44 },
        { cx: 325, cy: 150, r: 130, lx: 372, ly: 44 },
      ];

  geos.forEach((g, i) => {
    svg.appendChild(makeSvg("circle", {
      cx: String(g.cx), cy: String(g.cy), r: String(g.r),
      class: "vzd-venn-circle", "data-ci": String(i),
    }));
    const t = makeSvg("text", {
      x: String(g.lx), y: String(g.ly),
      class: "vzd-venn-circle-label", "text-anchor": "middle",
    });
    t.textContent = venn.circles[i].name;
    svg.appendChild(t);
  });

  wrap.appendChild(svg);

  type Pos = { l: number; t: number; w: number };
  const TWO: Record<string, Pos> = {
    "0":   { l: 27.5, t: 50,   w: 20 },
    "1":   { l: 72.5, t: 50,   w: 20 },
    "0+1": { l: 50,   t: 50,   w: 20 },
  };
  const THREE: Record<string, Pos> = {
    "0":     { l: 50,   t: 17,   w: 18 },
    "1":     { l: 75.6, t: 79.6, w: 18 },
    "2":     { l: 24.4, t: 79.6, w: 18 },
    "0+1":   { l: 60.4, t: 47.4, w: 14 },
    "0+2":   { l: 39.6, t: 47.4, w: 14 },
    "1+2":   { l: 50,   t: 75.7, w: 14 },
    "0+1+2": { l: 50,   t: 56.1, w: 13 },
  };
  const posMap = is3 ? THREE : TWO;

  for (const region of venn.regions) {
    if (region.items.length === 0) continue;
    const pos = posMap[region.key];
    if (!pos) continue;

    const div = wrap.createEl("div", { cls: "vzd-venn-region" });
    div.style.left = `${pos.l}%`;
    div.style.top = `${pos.t}%`;
    div.style.maxWidth = `${pos.w}%`;

    for (const item of region.items) {
      const itemEl = div.createEl("div", { cls: "vzd-venn-item" });
      if (item.linkTarget) {
        const link = itemEl.createEl("span", { cls: "vzd-venn-link", text: item.text });
        link.dataset.linkTarget = item.linkTarget;
        markInteractive(link);
        link.addEventListener("click", () => openLink((item as VennItem).linkTarget!));
      } else {
        itemEl.setText(item.text);
      }
    }
  }
}
