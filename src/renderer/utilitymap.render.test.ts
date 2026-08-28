// @vitest-environment happy-dom
import "../test-setup";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { parseBuyerUtilityMap } from "../utilitymap";
import { renderBuyerUtilityMap } from "./utilitymap";
import type { BuyerUtilityMapData } from "../types";

vi.mock("obsidian", async (orig) => {
  const actual = await orig<typeof import("obsidian")>();
  return { ...actual, MarkdownView: class MarkdownView {} };
});

function render(source: string): HTMLElement {
  const r = parseBuyerUtilityMap(source);
  if (!r.ok) throw new Error("expected ok");
  const el = document.createElement("div");
  document.body.appendChild(el);
  renderBuyerUtilityMap(r.data as BuyerUtilityMapData, el, {}); // read-only
  return el;
}

beforeEach(() => { document.body.innerHTML = ""; });

describe("renderBuyerUtilityMap", () => {
  it("renders the canonical 6 stage headers and 6 lever rows", () => {
    const el = render("");
    expect(el.querySelectorAll(".vzd-utility-stage")).toHaveLength(6);
    expect(el.querySelectorAll(".vzd-utility-lever")).toHaveLength(6);
  });

  it("renders 36 cells, marking utility and pain cells", () => {
    const el = render([
      "utility: Purchase | Convenience | Buy in-app",
      "pain: Disposal | Environmental | Waste",
    ].join("\n"));
    expect(el.querySelectorAll(".vzd-utility-cell")).toHaveLength(36);
    expect(el.querySelectorAll(".vzd-utility-cell--utility")).toHaveLength(1);
    expect(el.querySelectorAll(".vzd-utility-cell--pain")).toHaveLength(1);
    expect(el.querySelector(".vzd-utility-cell--utility .vzd-utility-note")?.textContent).toBe("Buy in-app");
  });

  it("renders a warning chip for an unknown lever", () => {
    const el = render("utility: Use | Nonsense");
    expect(el.querySelector(".vzd-canvas-warning-chip")).toBeTruthy();
  });
});
