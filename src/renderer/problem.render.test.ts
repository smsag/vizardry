// @vitest-environment happy-dom
import "../test-setup";
import { describe, it, expect, beforeEach } from "vitest";
import { parseProblem } from "../problem";
import { renderProblem } from "./problem";
import type { FlowData } from "../types/problem";

function render(source: string, variant?: string): HTMLElement {
  const r = parseProblem(source, variant);
  if (!r.ok) throw new Error(r.error);
  const el = document.createElement("div");
  document.body.appendChild(el);
  renderProblem(r.data as FlowData, el, {});
  return el;
}

beforeEach(() => { document.body.innerHTML = ""; });

describe("renderProblem", () => {
  it("draws one card per node and one edge path per link", () => {
    const el = render([
      "ideal: I",
      "reality: R1",
      "reality: R2",
      "consequences: C",
      "link: I -> R1 & R2",
      "link: R1 & R2 -> C",
    ].join("\n"));

    expect(el.querySelectorAll(".vzd-flow-card").length).toBe(4);
    expect(el.querySelectorAll(".vzd-flow-edge").length).toBe(4);
  });

  it("shows the stage eyebrow, the heading, and the optional body", () => {
    const el = render("ideal: Fast line | Assembles efficiently.\nreality: Manual");
    const eyebrows = Array.from(el.querySelectorAll(".vzd-flow-eyebrow")).map(e => e.textContent);
    expect(eyebrows).toEqual(["Ideal", "Reality"]);
    expect(el.querySelector(".vzd-flow-heading")?.textContent).toContain("Fast line");
    const bodies = Array.from(el.querySelectorAll(".vzd-flow-body")).map(b => b.textContent);
    expect(bodies).toEqual(["Assembles efficiently."]); // only the card with a body renders one
  });

  it("tags cards with their role class (gap muted, direction accent)", () => {
    const el = render("ideal: I\nreality: R\nconsequences: C\nproposal: P");
    expect(el.querySelectorAll(".vzd-flow-card--setup").length).toBe(1);
    expect(el.querySelectorAll(".vzd-flow-card--gap").length).toBe(1);
    expect(el.querySelectorAll(".vzd-flow-card--stakes").length).toBe(1);
    expect(el.querySelectorAll(".vzd-flow-card--direction").length).toBe(1);
  });

  it("places same-stage cards in one column (shared x) stacked in source order", () => {
    const el = render("reality: A\nreality: B");
    const rects = Array.from(el.querySelectorAll<SVGRectElement>("rect.vzd-flow-card"));
    const xs = rects.map(r => r.getAttribute("x"));
    const ys = rects.map(r => Number(r.getAttribute("y")));
    expect(xs[0]).toBe(xs[1]);        // same column
    expect(ys[1]).toBeGreaterThan(ys[0]); // B below A
  });

  it("renders a warning chip for recoverable issues", () => {
    const el = render("ideal: X\nbogus: line");
    expect(el.querySelector(".vzd-canvas-warning-chip")).toBeTruthy();
  });
});
