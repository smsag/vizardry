// @vitest-environment happy-dom
import "../test-setup";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { parseProblem } from "../problem";
import { renderProblem } from "./problem";
import { renderFlowGraph, type FlowEdit } from "./flow-graph";
import type { FlowData, StageDef } from "../types/problem";

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

describe("renderFlowGraph — live editing", () => {
  const stages: StageDef[] = [
    { key: "ideal", eyebrow: "Ideal", role: "setup" },
    { key: "reality", eyebrow: "Reality", role: "gap" },
  ];
  const nodes = [
    { stage: "ideal", id: "ideal_1", heading: "I", body: "b" },
    { stage: "reality", id: "reality_1", heading: "R" },
  ];

  function host(): HTMLElement {
    const el = document.createElement("div");
    document.body.appendChild(el);
    return el;
  }

  it("read mode: no edit affordances", () => {
    const el = host();
    renderFlowGraph(el, { stages, nodes, edges: [] }, {});
    expect(el.querySelectorAll(".vzd-flow-editable")).toHaveLength(0);
    expect(el.querySelectorAll(".vzd-flow-card-delete, .vzd-flow-add")).toHaveLength(0);
  });

  it("edit mode: editable fields + a delete per card + an add per column", () => {
    const el = host();
    const edit: FlowEdit = { editText: vi.fn(), deleteCard: vi.fn(), addCard: vi.fn() };
    renderFlowGraph(el, { stages, nodes, edges: [], edit }, {});
    expect(el.querySelectorAll(".vzd-flow-editable")).toHaveLength(4); // heading + body per card
    expect(el.querySelectorAll(".vzd-flow-card-delete")).toHaveLength(2);
    expect(el.querySelectorAll(".vzd-flow-add")).toHaveLength(2); // one per stage column
  });

  it("clicking a heading edits it in place; Enter commits the new text", () => {
    const el = host();
    const edit: FlowEdit = { editText: vi.fn(), deleteCard: vi.fn(), addCard: vi.fn() };
    renderFlowGraph(el, { stages, nodes, edges: [], edit }, {});
    const headEl = el.querySelector<HTMLElement>(".vzd-flow-heading--edit")!;
    headEl.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(headEl.getAttribute("contenteditable")).toBe("plaintext-only");
    headEl.textContent = "New heading";
    headEl.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(edit.editText).toHaveBeenCalledWith(expect.objectContaining({ id: "ideal_1" }), "New heading", "b");
    expect(headEl.getAttribute("contenteditable")).toBeNull(); // exits edit cleanly
  });

  it("Escape cancels an edit without committing", () => {
    const el = host();
    const edit: FlowEdit = { editText: vi.fn(), deleteCard: vi.fn(), addCard: vi.fn() };
    renderFlowGraph(el, { stages, nodes, edges: [], edit }, {});
    const headEl = el.querySelector<HTMLElement>(".vzd-flow-heading--edit")!;
    headEl.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    headEl.textContent = "changed";
    headEl.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(edit.editText).not.toHaveBeenCalled();
    expect(headEl.textContent).toBe("I"); // reverted
  });

  it("edit mode reserves height for the always-shown fields so cards aren't clipped", () => {
    // A body-less card renders its (empty) body field with a placeholder in edit
    // mode, so its box must be taller than the same node rendered read-only —
    // otherwise the field overflows the fixed-height card and gets cut off.
    const readEl = host();
    renderFlowGraph(readEl, { stages, nodes, edges: [] }, {});
    const editEl = host();
    const edit: FlowEdit = { editText: vi.fn(), deleteCard: vi.fn(), addCard: vi.fn() };
    renderFlowGraph(editEl, { stages, nodes, edges: [], edit }, {});

    // The reality card (index 1) has no body; compare its rect height.
    const readH = Number(readEl.querySelectorAll<SVGRectElement>("rect.vzd-flow-card")[1].getAttribute("height"));
    const editH = Number(editEl.querySelectorAll<SVGRectElement>("rect.vzd-flow-card")[1].getAttribute("height"));
    expect(editH).toBeGreaterThan(readH);
  });

  it("clicking delete / add calls the handlers", () => {
    const el = host();
    const edit: FlowEdit = { editText: vi.fn(), deleteCard: vi.fn(), addCard: vi.fn() };
    renderFlowGraph(el, { stages, nodes, edges: [], edit }, {});
    el.querySelector<HTMLElement>(".vzd-flow-card-delete")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(edit.deleteCard).toHaveBeenCalledWith(expect.objectContaining({ id: "ideal_1" }));
    el.querySelector<HTMLElement>(".vzd-flow-add")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(edit.addCard).toHaveBeenCalledWith("ideal");
  });
});
