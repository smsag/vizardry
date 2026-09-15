// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { VIZARDRY_ICON_ID, VIZARDRY_ICON_SVG } from "./icon";

/** Parses the markup the way Obsidian does — as the body of a 100-unit svg. */
function render(): SVGSVGElement {
  const host = document.createElement("div");
  host.innerHTML = `<svg viewBox="0 0 100 100">${VIZARDRY_ICON_SVG}</svg>`;
  return host.firstElementChild as SVGSVGElement;
}

describe("the Vizardry icon", () => {
  it("has a stable id", () => {
    // Persisted into workspace.json by any leaf using it — renaming it would
    // leave restored leaves with a missing icon.
    expect(VIZARDRY_ICON_ID).toBe("vizardry-v");
  });

  it("is well-formed markup with no stray elements", () => {
    const svg = render();
    expect(svg.querySelector("parsererror")).toBeNull();
    const g = svg.firstElementChild!;
    expect(g.tagName.toLowerCase()).toBe("g");
    expect(g.children).toHaveLength(2); // the V, and the spark
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
  });

  it("draws the spark filled, not stroked", () => {
    // At the ~18px a sidebar tab renders, a stroked star collapses into a blob.
    const spark = render().firstElementChild!.children[1];
    expect(spark.getAttribute("fill")).toBe("currentColor");
    expect(spark.getAttribute("stroke")).toBe("none");
  });

  it("keeps the V as an open stroke", () => {
    const g = render().firstElementChild!;
    expect(g.getAttribute("fill")).toBe("none");
    expect(g.children[0].getAttribute("d")).toMatch(/^M4 5\.5/);
  });

  it("stays inside the 24-unit grid it is drawn on", () => {
    // Anything outside would be clipped once scaled into the icon box.
    const coords = [...VIZARDRY_ICON_SVG.matchAll(/[ML] ?(-?[\d.]+) (-?[\d.]+)/g)]
      .flatMap(m => [Number(m[1]), Number(m[2])]);
    expect(coords.length).toBeGreaterThan(0);
    expect(Math.min(...coords)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...coords)).toBeLessThanOrEqual(24);
  });
});
