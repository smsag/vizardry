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

describe("layoutFishbone — room for long cause labels", () => {
  const cause = (name: string): { name: string; subcauses: [] } => ({ name, subcauses: [] });
  // Two bones per side, causes at or near the 30-character limit.
  const long: FishboneDiagram = {
    effect: "Leads go cold before the first viewing",
    categories: [
      { name: "Process", causes: [cause("No owner assigned to new leads"), cause("Follow-up is never scheduled")] },
      { name: "People", causes: [cause("Agents out on viewings all day")] },
      { name: "Tools", causes: [cause("Portal leads only come by mail"), cause("No reminders in the phone app")] },
      { name: "Data", causes: [cause("Duplicates split the history"), cause("Search profiles are left empty")] },
    ],
  };
  // The layout's own width estimate for a 12.5px cause label, and how far
  // the text reaches above and below its baseline.
  const labelRight = (c: { labelX: number; label: string }): number => c.labelX + c.label.length * 6.4;
  const textYs = (c: { labelY: number }): number[] => [c.labelY - 10, c.labelY + 3];
  const ribXAt = (rib: { x1: number; y1: number; x2: number; y2: number }, y: number): number | undefined => {
    const t = (y - rib.y1) / (rib.y2 - rib.y1);
    return t >= 0 && t <= 1 ? rib.x1 + t * (rib.x2 - rib.x1) : undefined;
  };

  it("ends every cause label before the next bone on its side", () => {
    const l = layoutFishbone(long);
    for (const top of [true, false]) {
      const side = l.categories.filter(c => c.top === top);
      for (let i = 0; i + 1 < side.length; i++) {
        for (const c of side[i]!.causes) {
          for (const y of textYs(c)) {
            const ribX = ribXAt(side[i + 1]!.rib, y);
            if (ribX !== undefined) expect(labelRight(c)).toBeLessThan(ribX);
          }
        }
      }
    }
  });

  it("ends a label level with the effect head before the head", () => {
    const l = layoutFishbone(long);
    const half = l.head.h / 2;
    for (const c of l.categories.flatMap(cat => cat.causes)) {
      if (textYs(c).some(y => Math.abs(y - l.spine.y1) < half)) expect(labelRight(c)).toBeLessThan(l.head.x);
    }
  });

  it("keeps the usual bone spacing when labels are short", () => {
    const short: FishboneDiagram = {
      effect: "Churn",
      categories: ["Process", "People", "Tools", "Data"].map(name => ({
        name, causes: [cause("Slow setup"), cause("No guidance")],
      })),
    };
    for (const top of [true, false]) {
      const side = layoutFishbone(short).categories.filter(c => c.top === top);
      expect(side[1]!.anchor.x - side[0]!.anchor.x).toBe(214);
    }
  });
});

describe("layoutFishbone — long and formatted names", () => {
  const long: FishboneDiagram = {
    effect: "Churn",
    categories: [{
      name: "People",
      causes: [{
        name: "**Insufficient training budget**",
        subcauses: [{ name: "==🔴No onboarding owner assigned this quarter==" }],
      }],
    }],
  };

  it("keeps the full source name as the edit key, whatever the label shows", () => {
    const cause = layoutFishbone(long).categories[0]!.causes[0]!;
    expect(cause.text).toBe("**Insufficient training budget**");
    expect(cause.subs[0]!.text).toBe("==🔴No onboarding owner assigned this quarter==");
  });

  it("draws the label without markers, truncated", () => {
    const cause = layoutFishbone(long).categories[0]!.causes[0]!;
    expect(cause.label).toBe("Insufficient training budget");
    expect(cause.subs[0]!.label.startsWith("No onboarding owner")).toBe(true);
    expect(cause.subs[0]!.label).not.toContain("==");
  });
});
