import { describe, it, expect } from "vitest";
import { labelBox, placeLabels, segmentHitsBox, NODE_R, type LabelNode } from "./wardley-geometry";

const node = (componentIndex: number, cx: number, cy: number, evo: number, vis: number, name: string): LabelNode =>
  ({ componentIndex, cx, cy, evo, vis, name });

describe("segmentHitsBox", () => {
  const box = { x1: 10, y1: 10, x2: 20, y2: 20 };
  it("detects a segment crossing the box, or ending inside it", () => {
    expect(segmentHitsBox({ x1: 0, y1: 15, x2: 30, y2: 15 }, box)).toBe(true);
    expect(segmentHitsBox({ x1: 0, y1: 0, x2: 15, y2: 15 }, box)).toBe(true);
    expect(segmentHitsBox({ x1: 0, y1: 0, x2: 30, y2: 30 }, box)).toBe(true); // diagonal through
  });
  it("misses a segment that passes beside it", () => {
    expect(segmentHitsBox({ x1: 0, y1: 25, x2: 30, y2: 25 }, box)).toBe(false);
    expect(segmentHitsBox({ x1: 0, y1: 0, x2: 30, y2: 5 }, box)).toBe(false);
  });
});

describe("placeLabels", () => {
  it("keeps the quadrant default when nothing is in the way", () => {
    const [slot] = placeLabels([node(0, 200, 200, 0.3, 0.7, "Alone")], { segments: [], boxes: [] });
    expect(slot).toMatchObject({ textX: 200 + NODE_R + 4, textY: 200 - NODE_R - 4, anchor: "start" });
  });

  it("moves a label off a line that runs through its default spot", () => {
    // A link leaving the node up and to the right, straight through the default (top-right) label.
    const n = node(0, 200, 200, 0.3, 0.7, "Auth Service");
    const segment = { x1: 200, y1: 200, x2: 320, y2: 160 };
    const def = labelBox(n.name, 200 + NODE_R + 4, 200 - NODE_R - 4, "start");
    expect(segmentHitsBox(segment, def)).toBe(true);
    const [slot] = placeLabels([n], { segments: [segment], boxes: [] });
    expect(segmentHitsBox(segment, labelBox(n.name, slot!.textX, slot!.textY, slot!.anchor))).toBe(false);
  });

  it("keeps two neighbours' labels from landing on each other", () => {
    const slots = placeLabels([node(0, 200, 200, 0.3, 0.7, "First"), node(1, 214, 204, 0.31, 0.69, "Second")], { segments: [], boxes: [] });
    const [a, b] = slots.map(s => labelBox(s.name, s.textX, s.textY, s.anchor));
    const overlap = a!.x1 < b!.x2 && b!.x1 < a!.x2 && a!.y1 < b!.y2 && b!.y1 < a!.y2;
    expect(overlap).toBe(false);
  });

  it("keeps a label on the canvas for a node at its right edge", () => {
    const [slot] = placeLabels([node(0, 790, 300, 0.99, 0.4, "Edge component")], { segments: [], boxes: [] });
    expect(labelBox(slot!.name, slot!.textX, slot!.textY, slot!.anchor).x2).toBeLessThanOrEqual(804);
  });
});
