// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { VIZARDRY_ICON_ID, VIZARDRY_ICON_SVG } from "./icon";

/** Parses the markup the way Obsidian does — as the body of a 100-unit svg. */
function render(): SVGSVGElement {
  const host = document.createElement("div");
  host.innerHTML = `<svg viewBox="0 0 100 100">${VIZARDRY_ICON_SVG}</svg>`;
  return host.firstElementChild as SVGSVGElement;
}

/**
 * Every point a shape touches, on the 24-unit grid. The artwork uses only
 * absolute M, relative h/v and a rect, so a small walker covers it.
 */
function touchedPoints(): number[] {
  const g = render().firstElementChild!;
  const points: number[] = [];
  for (const shape of Array.from(g.children)) {
    if (shape.tagName.toLowerCase() === "rect") {
      const n = (a: string) => Number(shape.getAttribute(a));
      points.push(n("x"), n("y"), n("x") + n("width"), n("y") + n("height"));
      continue;
    }
    let x = 0, y = 0;
    for (const [, cmd, arg] of (shape.getAttribute("d") ?? "").matchAll(/([MhvHV])\s*(-?[\d.]+(?:\s+-?[\d.]+)?)/g)) {
      const nums = arg.trim().split(/\s+/).map(Number);
      if (cmd === "M") [x, y] = nums;
      else if (cmd === "h") x += nums[0];
      else if (cmd === "v") y += nums[0];
      else if (cmd === "H") x = nums[0];
      else if (cmd === "V") y = nums[0];
      points.push(x, y);
    }
  }
  return points;
}

describe("the Vizardry icon", () => {
  it("has a stable id", () => {
    // Named by the ribbon, the entry commands and the sideleaf's getIcon();
    // a leaf restored from workspace.json asks for it by this name.
    expect(VIZARDRY_ICON_ID).toBe("vizardry-logo");
  });

  it("is well-formed markup with no stray elements", () => {
    const svg = render();
    expect(svg.querySelector("parsererror")).toBeNull();
    const g = svg.firstElementChild!;
    expect(g.tagName.toLowerCase()).toBe("g");
    expect(g.children).toHaveLength(6); // the frame, three grid lines, the spark's two strokes
    expect(g.children[0].tagName.toLowerCase()).toBe("rect");
  });

  it("scales Lucide's 24-unit grid into the 100-unit box addIcon draws in", () => {
    const g = render().firstElementChild!;
    const scale = Number(/scale\(([\d.]+)\)/.exec(g.getAttribute("transform") ?? "")?.[1]);
    expect(scale).toBeCloseTo(100 / 24, 3);
  });

  it("inherits the sidebar's colour rather than hard-coding one", () => {
    // A tab icon has to follow the theme, and change when the tab is active.
    const g = render().firstElementChild!;
    expect(g.getAttribute("stroke")).toBe("currentColor");
    expect(VIZARDRY_ICON_SVG).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(VIZARDRY_ICON_SVG).not.toMatch(/\b(rgb|hsl)a?\(/);
  });

  it("keeps Lucide's rules: 2-unit stroke, round caps and joins, stroke only", () => {
    const g = render().firstElementChild!;
    expect(g.getAttribute("fill")).toBe("none");
    expect(g.getAttribute("stroke-width")).toBe("2");
    expect(g.getAttribute("stroke-linecap")).toBe("round");
    expect(g.getAttribute("stroke-linejoin")).toBe("round");
    for (const shape of Array.from(g.children)) {
      expect(shape.hasAttribute("fill")).toBe(false);
      expect(shape.hasAttribute("stroke")).toBe(false);
    }
  });

  it("carries the designed geometry unchanged", () => {
    expect(VIZARDRY_ICON_SVG).toContain('<rect x="3" y="4" width="18" height="16" rx="2"/>');
    expect(VIZARDRY_ICON_SVG).toContain('<path d="M18 6.5v5"/>');
    expect(VIZARDRY_ICON_SVG).toContain('<path d="M15.5 9h5"/>');
  });

  it("stays inside the 24-unit grid it is drawn on", () => {
    // Anything outside would be clipped once scaled into the icon box.
    const points = touchedPoints();
    expect(points.length).toBeGreaterThan(0);
    expect(Math.min(...points)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...points)).toBeLessThanOrEqual(24);
  });
});
