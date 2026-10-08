// @vitest-environment happy-dom
import "../test-setup";
import { describe, it, expect, vi } from "vitest";
import { createAddControl } from "./add-control";

describe("createAddControl", () => {
  it("builds a slot: a labelled button with a plus", () => {
    const parent = document.createElement("div");
    const btn = createAddControl(parent, { label: "Add argument", onAdd: vi.fn() });
    expect(btn.parentElement).toBe(parent);
    expect(btn.type).toBe("button");
    expect(btn.className).toBe("vzd-add vzd-add--slot");
    expect(btn.querySelector(".vzd-add-icon")).not.toBeNull();
    expect(btn.querySelector(".vzd-add-label")?.textContent).toBe("Add argument");
  });

  it("builds a dot: icon only, the label as its accessible name", () => {
    const btn = createAddControl(document.createElement("div"), {
      label: "Add row below", variant: "dot", cls: "vzd-x", onAdd: vi.fn(),
    });
    expect(btn.classList.contains("vzd-add--dot")).toBe(true);
    expect(btn.classList.contains("vzd-x")).toBe(true);
    expect(btn.querySelector(".vzd-add-label")).toBeNull();
    expect(btn.getAttribute("aria-label")).toBe("Add row below");
  });

  it("marks an always-visible control", () => {
    const btn = createAddControl(document.createElement("div"), { label: "Add", alwaysVisible: true, onAdd: vi.fn() });
    expect(btn.classList.contains("vzd-add--always")).toBe(true);
  });

  it("calls onAdd without letting the click reach the canvas", () => {
    const parent = document.createElement("div");
    const outer = vi.fn();
    parent.addEventListener("click", outer);
    const onAdd = vi.fn();
    createAddControl(parent, { label: "Add", onAdd }).click();
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();
  });

  it("works under an SVG foreignObject", () => {
    const fo = document.createElementNS("http://www.w3.org/2000/svg", "foreignObject");
    const btn = createAddControl(fo, { label: "Add card", onAdd: vi.fn() });
    expect(btn.parentNode).toBe(fo);
    expect(btn.tagName).toBe("BUTTON");
  });
});
