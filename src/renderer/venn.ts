import type { VennDiagram, VennItem } from "../types";
import { initCanvas, markInteractive } from "./controls";
import { createSvgEl } from "../shared/svg";

// ── Color utilities ────────────────────────────────────────────────────────

/** Convert an RGB triplet (0–255) to [h, s, l] (degrees, %, %). */
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, Math.round(l * 100)];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  switch (max) {
    case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
    case g: h = ((b - r) / d + 2) / 6; break;
    case b: h = ((r - g) / d + 4) / 6; break;
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

/** Parse a 6-digit hex color to [h, s, l]. */
function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return rgbToHsl(r, g, b);
}

/**
 * Read Obsidian's current accent color and return [h, s, l].
 * Priority: vault config hex → --interactive-accent CSS var → fallback blue.
 */
function getAccentHsl(): [number, number, number] {
  // 1. Obsidian vault config stores the accent as a hex string
  try {
    const hex: string | undefined = (window as any).app?.vault?.config?.accentColor;
    if (hex && /^#[0-9a-f]{6}$/i.test(hex)) return hexToHsl(hex);
  } catch { /* ignore */ }

  // 2. CSS variable --interactive-accent (may be rgb(), hsl(), or hex)
  try {
    const raw = getComputedStyle(document.body)
      .getPropertyValue("--interactive-accent").trim();

    const rgb = raw.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (rgb) return rgbToHsl(+rgb[1], +rgb[2], +rgb[3]);

    const hsl = raw.match(/hsl\((\d+(?:\.\d+)?),\s*([\d.]+)%,\s*([\d.]+)%/);
    if (hsl) return [Math.round(+hsl[1]), Math.round(+hsl[2]), Math.round(+hsl[3])];

    const inlineHex = raw.match(/#([0-9a-f]{6})/i);
    if (inlineHex) return hexToHsl(`#${inlineHex[1]}`);
  } catch { /* ignore */ }

  // 3. Fallback: Obsidian default blue
  return [220, 75, 60];
}

/** Build fill and stroke HSLA strings for one circle. */
function circleStyle(h: number, s: number, l: number): { fill: string; stroke: string } {
  // Clamp lightness into a visible range regardless of the chosen accent
  const fillL   = Math.min(Math.max(l, 45), 68);
  const strokeL = Math.max(fillL - 8, 20);
  return {
    fill:   `hsla(${h}, ${s}%, ${fillL}%, 0.12)`,
    stroke: `hsla(${h}, ${s}%, ${strokeL}%, 0.5)`,
  };
}

// ── Renderer ───────────────────────────────────────────────────────────────

export function renderVennDiagram(
  venn: VennDiagram,
  container: HTMLElement,
  openLink: (target: string) => void
): void {
  initCanvas(container, "venn", "Venn Diagram");

  // Count already-rendered Venn diagrams to derive the rotation offset.
  // This call happens before we add .vzd-venn-wrap, so it gives the correct index.
  const diagramIdx = document.querySelectorAll(".vzd-venn-wrap").length;

  // ── Accent palette ────────────────────────────────────────────────────
  const [accentH, accentS, accentL] = getAccentHsl();
  const is3 = venn.circles.length === 3;

  let hues: number[];
  if (is3) {
    // Triadic: three hues 120° apart, rotated per diagram
    const base: [number, number, number] = [
      accentH,
      (accentH + 120) % 360,
      (accentH + 240) % 360,
    ];
    const rot = diagramIdx % 3;
    hues = [base[(0 + rot) % 3], base[(1 + rot) % 3], base[(2 + rot) % 3]];
  } else {
    // Complementary: two hues 180° apart, accent circle alternates
    const base: [number, number] = [accentH, (accentH + 180) % 360];
    const rot = diagramIdx % 2;
    hues = [base[rot % 2], base[(rot + 1) % 2]];
  }

  // ── SVG construction ──────────────────────────────────────────────────
  const wrap = container.createEl("div", { cls: "vzd-venn-wrap" });

  const svg = createSvgEl("svg", {
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
    const { fill, stroke } = circleStyle(hues[i], accentS, accentL);
    const circle = createSvgEl("circle", {
      cx: String(g.cx), cy: String(g.cy), r: String(g.r),
      class: "vzd-venn-circle", "data-ci": String(i),
    });
    circle.style.fill        = fill;
    circle.style.stroke      = stroke;
    circle.style.strokeWidth = "1.5";
    svg.appendChild(circle);

    const t = createSvgEl("text", {
      x: String(g.lx), y: String(g.ly),
      class: "vzd-venn-circle-label", "text-anchor": "middle",
    });
    t.textContent = venn.circles[i].name;
    svg.appendChild(t);
  });

  wrap.appendChild(svg);

  // ── Region label overlay ──────────────────────────────────────────────
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
    div.style.left    = `${pos.l}%`;
    div.style.top     = `${pos.t}%`;
    div.style.maxWidth = `${pos.w}%`;

    for (const item of region.items) {
      const itemEl = div.createEl("div", { cls: "vzd-venn-item" });
      if (item.linkTarget) {
        const link = itemEl.createEl("span", {
          cls: "vzd-venn-link",
          text: item.text,
        });
        link.dataset.linkTarget = item.linkTarget;
        markInteractive(link);
        link.addEventListener("click", () =>
          openLink(item.linkTarget!)
        );
      } else {
        itemEl.setText(item.text);
      }
    }
  }
}
