// @vitest-environment happy-dom
/**
 * The sketch wobble filter must stay cheap in WebKit and must never hide a
 * straight stroke.
 *
 * 0.74.0 gave the filter a fixed 200 000-unit user-space region so horizontal
 * and vertical strokes (whose bounding box has no height or no width) stayed
 * visible. WebKit computes the filter over the whole region of every filtered
 * shape: 16–24 s per canvas, and on an iPhone iOS killed Obsidian while it
 * opened a note with an OST in sketch mode. The region is the shape's box
 * again; flat shapes are marked by geometry and left unfiltered instead.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ensureSketchDefs, removeSketchDefs, SKETCH_FILTER_ID } from "./sketch-defs";
import { createSvgEl, isFlatPath, markFlatShape, FLAT_SHAPE_ATTR } from "./svg";

const flat = (el: Element): boolean => el.hasAttribute(FLAT_SHAPE_ATTR);

describe("sketch filter region", () => {
  beforeEach(() => { removeSketchDefs(document); });

  it("is each shape's own box, never a fixed user-space region", () => {
    ensureSketchDefs(document);
    const filter = document.getElementById(SKETCH_FILTER_ID)!;
    expect(filter).not.toBeNull();
    expect(filter.getAttribute("filterUnits") ?? "objectBoundingBox").toBe("objectBoundingBox");
    for (const attr of ["x", "y", "width", "height"]) expect(filter.hasAttribute(attr)).toBe(false);
  });

  it("is never applied to a shape marked flat", () => {
    const css = readFileSync(resolve(__dirname, "../../styles.css"), "utf8");
    const rules = [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]*)\{([^{}]*)\}/g)]
      .filter(([, , body]) => /filter:\s*url\(#vzd-sketch-rough\)/.test(body));
    expect(rules.length).toBeGreaterThan(0);
    for (const [, selector] of rules) {
      // Top-level commas only: `:is(path, line, …)` holds commas of its own.
      const parts: string[] = [];
      let depth = 0, cur = "";
      for (const ch of selector) {
        if (ch === "(") depth++;
        if (ch === ")") depth--;
        if (ch === "," && depth === 0) { parts.push(cur); cur = ""; } else cur += ch;
      }
      parts.push(cur);
      for (const part of parts.map((s) => s.trim()).filter(Boolean)) {
        expect(part).toContain(`:not([${FLAT_SHAPE_ATTR}])`);
      }
    }
  });
});

describe("flat shapes", () => {
  it("marks a horizontal or vertical line, not a diagonal one", () => {
    expect(flat(createSvgEl("line", { x1: "0", y1: "5", x2: "40", y2: "5" }))).toBe(true);
    expect(flat(createSvgEl("line", { x1: "3", y1: "0", x2: "3", y2: "40" }))).toBe(true);
    expect(flat(createSvgEl("line", { x1: "0", y1: "0", x2: "40", y2: "1" }))).toBe(false);
  });

  it("marks a rect with no width or height, and leaves circles filtered", () => {
    expect(flat(createSvgEl("rect", { width: "10", height: "0" }))).toBe(true);
    expect(flat(createSvgEl("rect", { width: "10", height: "4" }))).toBe(false);
    expect(flat(createSvgEl("circle", { cx: "0", cy: "0", r: "4" }))).toBe(false);
  });

  it("reads polyline points", () => {
    expect(flat(createSvgEl("polyline", { points: "0,10 20,10 40,10" }))).toBe(true);
    expect(flat(createSvgEl("polygon", { points: "0,0 10,0 5,8" }))).toBe(false);
  });

  it("reads a path's endpoints and control points", () => {
    expect(isFlatPath("M5 12h14")).toBe(true);           // an icon's minus
    expect(isFlatPath("M10,0 V200")).toBe(true);         // a spine
    expect(isFlatPath("M0 0 L50 0 L100 0")).toBe(true);
    expect(isFlatPath("M0 0 50 0 100 0")).toBe(true);     // implicit lineto after moveto
    expect(isFlatPath("m10 10 l20 0 l20 0")).toBe(true);  // relative
    expect(isFlatPath("M0 0 L50 0 L50 30")).toBe(false);  // an elbow edge
    expect(isFlatPath("M0 0 C10 -20 30 -20 40 0")).toBe(false); // curve bulges by its controls
    expect(isFlatPath("M0 0 A10 10 0 0 1 20 0")).toBe(false);   // arc bulges off its chord
    expect(isFlatPath("M0 0 L10 0 M0 5 L10 5")).toBe(false);    // two strokes: box has height
    expect(isFlatPath("")).toBe(true);
    expect(isFlatPath("M0 0 L10 0 L junk")).toBe(true);   // stops at the error, like a browser
  });

  it("is re-read after the geometry changes", () => {
    const ghost = createSvgEl("line", { x1: "0", y1: "0", x2: "0", y2: "0" });
    expect(flat(ghost)).toBe(true);
    ghost.setAttribute("x2", "30");
    ghost.setAttribute("y2", "20");
    markFlatShape(ghost);
    expect(flat(ghost)).toBe(false);
  });
});
