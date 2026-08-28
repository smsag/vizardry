// @vitest-environment happy-dom
import "../test-setup";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { parseStrategyCanvas } from "../strategycanvas";
import { renderStrategyCanvas } from "./strategycanvas";
import type { StrategyCanvasData } from "../types";

vi.mock("obsidian", async (orig) => {
  const actual = await orig<typeof import("obsidian")>();
  return { ...actual, MarkdownView: class MarkdownView {} };
});

function render(source: string): HTMLElement {
  const r = parseStrategyCanvas(source);
  if (!r.ok) throw new Error(r.error);
  const el = document.createElement("div");
  document.body.appendChild(el);
  renderStrategyCanvas(r.data as StrategyCanvasData, el, {}); // read-only
  return el;
}

beforeEach(() => { document.body.innerHTML = ""; });

const SRC = [
  "series: Us | Rival | Industry",
  "factor: Price | 8 | 3 | 9",
  "factor: Meals | 2 | 8 | 2",
  "factor: Lounges | 1 | 9 | 1",
].join("\n");

describe("renderStrategyCanvas", () => {
  it("draws one legend chip and one value curve per series", () => {
    const el = render(SRC);
    expect(el.querySelectorAll(".vzd-strategy-legend-item")).toHaveLength(3);
    expect(el.querySelectorAll(".vzd-strategy-line")).toHaveLength(3);
  });

  it("labels every factor along the X axis", () => {
    const el = render(SRC);
    const labels = Array.from(el.querySelectorAll(".vzd-strategy-factor")).map(l => l.textContent);
    expect(labels).toEqual(["Price", "Meals", "Lounges"]);
  });

  it("renders a warning chip for a recoverable issue", () => {
    const el = render("series: Us\nfactor: Price | 12\nfactor: Meals | 4");
    expect(el.querySelector(".vzd-canvas-warning-chip")).toBeTruthy();
  });
});
