// @vitest-environment happy-dom

/**
 * Live-Preview interactions on the Node Map renderer: dragging a box and the
 * "+" link handle's visibility. happy-dom has no layout, so the SVG's screen
 * box is stubbed to sit at the page origin at 1:1 scale — client coordinates
 * then equal SVG coordinates minus the viewBox origin.
 */

import "../test-setup";
import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("obsidian", async (orig) => {
  const actual = await orig<typeof import("obsidian")>();
  return { ...actual, MarkdownView: class MarkdownView {}, Notice: class Notice {} };
});
vi.mock("../shared/editor", async (orig) => ({
  ...(await orig<typeof import("../shared/editor")>()),
  isEditModeActive: () => true,
}));
vi.mock("../shared/nodemap-edit", () => ({
  writeNodeMapBoxPosition: vi.fn(() => true),
  addNodeMapBox: vi.fn(), removeNodeMapBox: vi.fn(), renameNodeMapBox: vi.fn(),
  writeNodeMapBoxBody: vi.fn(), setNodeMapBoxColor: vi.fn(),
  addNodeMapLink: vi.fn(), removeNodeMapLink: vi.fn(),
}));

import { parseNodeMap } from "../nodemap";
import { renderNodeMap, placeAutoBoxes, type MeasuredBox } from "./nodemap";
import { writeNodeMapBoxPosition } from "../shared/nodemap-edit";

const SRC = [
  "box: Customer [x: 40, y: 40]",
  "box: Order Service [x: 320, y: 40]",
  "  Handles order creation",
  "link: Customer -> Order Service",
].join("\n");

let vb = { x: 0, y: 0 };

function render(source: string): { el: HTMLElement; svg: SVGSVGElement } {
  const r = parseNodeMap(source);
  if (!r.ok) throw new Error(r.error);
  const el = document.createElement("div");
  document.body.appendChild(el);
  // Truthy app/ctx: only their presence is checked; every write is mocked.
  renderNodeMap(r.data, el, { app: {} as never, ctx: {} as never, source });
  const svg = el.querySelector<SVGSVGElement>(".vzd-nodemap-svg")!;
  const [x, y, w, h] = svg.getAttribute("viewBox")!.split(" ").map(Number);
  vb = { x, y };
  svg.getScreenCTM = () => null;
  svg.getBoundingClientRect = () => ({ left: 0, top: 0, right: w, bottom: h, width: w, height: h, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  return { el, svg };
}

/** Client coordinates for an SVG point. */
const at = (x: number, y: number): { clientX: number; clientY: number } => ({ clientX: x - vb.x, clientY: y - vb.y });

function pointer(target: EventTarget, type: string, pos: { clientX: number; clientY: number }): void {
  target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, button: 0, pointerType: "mouse", ...pos }));
}

function boxGroup(el: HTMLElement, name: string): SVGGElement {
  return el.querySelector<SVGGElement>(`.vzd-nodemap-box-g[data-box-name="${name}"]`)!;
}

beforeEach(() => {
  document.body.innerHTML = "";
  vi.mocked(writeNodeMapBoxPosition).mockClear();
});

describe("Node Map drag", () => {
  it("drags a box by its name text and writes where it was dropped, keeping the grab point", () => {
    const { el } = render(SRC);
    const name = boxGroup(el, "Customer").querySelector(".vzd-nodemap-box-name")!;

    // Grab 20,10 into the box (at 40,40), drop with the pointer at 220,110.
    pointer(name, "pointerdown", at(60, 50));
    pointer(document, "pointermove", at(140, 80));
    pointer(document, "pointermove", at(220, 110));
    pointer(document, "pointerup", at(220, 110));

    expect(writeNodeMapBoxPosition).toHaveBeenCalledTimes(1);
    const [, , , boxName, x, y] = vi.mocked(writeNodeMapBoxPosition).mock.calls[0];
    expect([boxName, x, y]).toEqual(["Customer", 200, 100]);
  });

  it("moves the box's link with it while dragging", () => {
    const { el } = render(SRC);
    const linkY1 = (): string | null => el.querySelector(".vzd-nodemap-link")!.getAttribute("y1");
    const before = linkY1();
    pointer(boxGroup(el, "Customer"), "pointerdown", at(60, 50));
    pointer(document, "pointermove", at(60, 250));
    expect(linkY1()).not.toBe(before);
    pointer(document, "pointerup", at(60, 250));
  });

  it("treats a press that barely moves as a click: no write", () => {
    const { el } = render(SRC);
    pointer(boxGroup(el, "Customer"), "pointerdown", at(60, 50));
    pointer(document, "pointermove", at(61, 51));
    pointer(document, "pointerup", at(61, 51));
    expect(writeNodeMapBoxPosition).not.toHaveBeenCalled();
  });

  it("puts the box back and writes nothing when the drag is cancelled with Escape", () => {
    const { el } = render(SRC);
    const g = boxGroup(el, "Customer");
    pointer(g, "pointerdown", at(60, 50));
    pointer(document, "pointermove", at(200, 200));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    pointer(document, "pointerup", at(200, 200));
    expect(g.querySelector("rect")!.getAttribute("x")).toBe("40");
    expect(writeNodeMapBoxPosition).not.toHaveBeenCalled();
  });
});

describe("Node Map link handle", () => {
  function handleOf(el: HTMLElement, i: number): SVGGElement {
    return el.querySelectorAll<SVGGElement>(".vzd-nodemap-add-handle-g")[i];
  }

  it("stays shown while the pointer travels from a box's corner to the handle", () => {
    const { el, svg } = render(SRC);
    const handle = handleOf(el, 1); // Order Service: x 320, a tall box with a body
    pointer(svg, "pointermove", at(325, 44));           // top-left corner of the box
    expect(handle.style.display).toBe("");
    // Leave the box above the handle's level and glide across empty space.
    for (const [x, y] of [[440, 44], [448, 50], [452, 56]]) {
      pointer(svg, "pointermove", at(x, y));
      expect(handle.style.display).toBe("");
    }
  });

  it("hides once the pointer is well away from the box", () => {
    const { el, svg } = render(SRC);
    const handle = handleOf(el, 0);
    pointer(svg, "pointermove", at(60, 50));
    expect(handle.style.display).toBe("");
    pointer(svg, "pointermove", at(60, 300));
    expect(handle.style.display).toBe("none");
  });
});

describe("placeAutoBoxes", () => {
  const box = (name: string, extra: Partial<MeasuredBox> = {}): MeasuredBox =>
    ({ name, x: 0, y: 0, width: 110, height: 32, ...extra });

  it("lays boxes without coordinates out in rows below the positioned ones", () => {
    const boxes = [box("Fixed", { x: 300, y: 100, height: 60 }), box("A", { auto: true }), box("B", { auto: true })];
    placeAutoBoxes(boxes);
    expect(boxes[0]).toMatchObject({ x: 300, y: 100 });
    expect(boxes[1]).toMatchObject({ x: 40, y: 200 });
    expect(boxes[2]).toMatchObject({ x: 190, y: 200 });
  });

  it("wraps to a new row, and starts at the top-left when nothing is positioned", () => {
    const boxes = Array.from({ length: 6 }, (_, i) => box(`B${i}`, { auto: true }));
    placeAutoBoxes(boxes);
    expect(boxes[0]).toMatchObject({ x: 40, y: 40 });
    expect(new Set(boxes.map(b => b.y)).size).toBe(2);
    expect(boxes.find(b => b.y > 40)!.x).toBe(40);
  });

  it("renders a map whose boxes have no coordinates, without overlap", () => {
    const { el } = render("box: A\nbox: B\nbox: C [color: blue]\nlink: A -> B");
    const xs = Array.from(el.querySelectorAll(".vzd-nodemap-box")).map(r => Number(r.getAttribute("x")));
    expect(xs).toEqual([40, 190, 340]);
  });
});
