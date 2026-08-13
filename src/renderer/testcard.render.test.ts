// @vitest-environment happy-dom
import "../test-setup";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { parseTestCard } from "../testcard";
import { renderTestCard } from "./testcard";
import type { TestCardData } from "../types/testcard";

vi.mock("obsidian", async (orig) => {
  const actual = await orig<typeof import("obsidian")>();
  return { ...actual, MarkdownView: class MarkdownView {} };
});

function render(source: string): HTMLElement {
  const r = parseTestCard(source);
  if (!r.ok) throw new Error(r.error);
  const el = document.createElement("div");
  document.body.appendChild(el);
  renderTestCard(r.data as TestCardData, el, {}); // no app/ctx → read-only
  return el;
}

beforeEach(() => { document.body.innerHTML = ""; });

const SRC = [
  "title: Pricing test",
  "hypothesis: SMBs will pay",
  "critical: 3",
  "test: Run a paywall test",
  "cost: 2",
  "reliability: 2",
  "metric: Paid conversion",
  "time: 1",
  "criteria: Conversion > 5%",
].join("\n");

describe("renderTestCard", () => {
  it("renders one step per beat with its eyebrow, prompt, and text", () => {
    const el = render(SRC);
    expect(el.querySelectorAll(".vzd-tc-step")).toHaveLength(4);
    const prompts = Array.from(el.querySelectorAll(".vzd-tc-prompt")).map(p => p.textContent);
    expect(prompts).toEqual(["We believe that", "To verify that, we will", "And measure", "We are right if"]);
    expect(el.querySelector(".vzd-tc-step--hypothesis .vzd-tc-fill")?.textContent).toBe("SMBs will pay");
  });

  it("renders the four gauges with the right filled-dot counts", () => {
    const el = render(SRC);
    const filledCounts = Array.from(el.querySelectorAll(".vzd-tc-gauge")).map(g => ({
      label: g.querySelector(".vzd-tc-gauge-label")?.textContent,
      filled: g.querySelectorAll(".vzd-tc-dot.is-filled").length,
    }));
    expect(filledCounts).toEqual([
      { label: "Critical", filled: 3 },
      { label: "Test cost", filled: 2 },
      { label: "Data reliability", filled: 2 },
      { label: "Time required", filled: 1 },
    ]);
  });

  it("shows a placeholder for an empty step and no gauge on the criteria step", () => {
    const el = render("hypothesis: X");
    const criteriaFill = el.querySelector(".vzd-tc-step--criteria .vzd-tc-fill");
    expect(criteriaFill?.classList.contains("vzd-tc-fill--empty")).toBe(true);
    expect(el.querySelector(".vzd-tc-step--criteria .vzd-tc-gauge")).toBeNull();
  });

  it("read mode: no edit affordances (dots/fills are not editable)", () => {
    const el = render(SRC);
    expect(el.querySelectorAll(".vzd-tc-dot--editable")).toHaveLength(0);
    expect(el.querySelectorAll(".vzd-tc-fill--editable")).toHaveLength(0);
  });

  it("renders a warning chip for a recoverable issue", () => {
    const el = render("hypothesis: X\ncritical: nope");
    expect(el.querySelector(".vzd-canvas-warning-chip")).toBeTruthy();
  });
});
