import { describe, it, expect } from "vitest";
import { layoutFishbone } from "./fishbone-geometry";
import type { FishboneDiagram } from "../types";

const diagram: FishboneDiagram = {
  effect: "High customer churn in month one",
  categories: [
    { name: "Product", causes: [{ name: "No guidance", subcauses: [{ name: "Empty state" }] }, { name: "Slow setup", subcauses: [] }] },
    { name: "Process", causes: [{ name: "Manual handoffs", subcauses: [] }] },
    { name: "People", causes: [] },
  ],
};

describe("layoutFishbone", () => {
  it("returns a positively-bounded canvas", () => {
    const l = layoutFishbone(diagram);
    expect(l.width).toBeGreaterThan(0);
    expect(l.height).toBeGreaterThan(0);
    expect(l.spine.x1).toBeGreaterThanOrEqual(0);
    expect(l.spine.y1).toBeGreaterThanOrEqual(0);
  });

  it("keeps one layout category per source category, alternating sides", () => {
    const l = layoutFishbone(diagram);
    expect(l.categories.map(c => c.name)).toEqual(["Product", "Process", "People"]);
    expect(l.categories.map(c => c.top)).toEqual([true, false, true]);
  });

  it("lays out a cause (with its stub and subs) per source cause", () => {
    const l = layoutFishbone(diagram);
    const product = l.categories[0];
    expect(product.causes).toHaveLength(2);
    expect(product.causes[0].subs).toHaveLength(1);
    expect(product.causes[0].stub.x2).toBeGreaterThan(product.causes[0].stub.x1); // stub runs toward the head
  });

  it("wraps the effect head text into at least one line and sizes the head", () => {
    const l = layoutFishbone(diagram);
    expect(l.head.lines.length).toBeGreaterThanOrEqual(1);
    expect(l.head.h).toBeGreaterThan(0);
    expect(l.head.x).toBeGreaterThan(l.spine.x2 - 1); // head sits past the spine end
  });

  it("places the effect head to the right of every category bone", () => {
    const l = layoutFishbone(diagram);
    const maxRibX = Math.max(...l.categories.map(c => c.rib.x2));
    expect(l.head.x + l.head.w).toBeGreaterThan(maxRibX);
  });
});
