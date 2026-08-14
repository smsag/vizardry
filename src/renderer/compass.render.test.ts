// @vitest-environment happy-dom
import "../test-setup";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { parseCompass } from "../compass";
import { renderCompass } from "./compass";
import type { CompassData } from "../types/compass";

vi.mock("obsidian", async (orig) => {
  const actual = await orig<typeof import("obsidian")>();
  return { ...actual, MarkdownView: class MarkdownView {}, Notice: class Notice {} };
});

const SRC = [
  "title: Onboarding",
  "forces: Users abandon setup",
  "problem: Can't reach first value",
  "insight: 40% | abandon before activation",
  "insight: interviews cite too many steps",
  "northstar: 50% activate in day one",
  "idea: Guided wizard",
  "idea: Smart defaults",
  "gtm: New signups first",
  "pricing: All tiers",
].join("\n");

function render(source: string, rc = {}): HTMLElement {
  const r = parseCompass(source);
  if (!r.ok) throw new Error(r.error);
  const el = document.createElement("div");
  document.body.appendChild(el);
  renderCompass(r.data as CompassData, el, rc);
  return el;
}

beforeEach(() => { document.body.innerHTML = ""; });

describe("renderCompass", () => {
  it("renders the four sections in order", () => {
    const el = render(SRC);
    const eyebrows = Array.from(el.querySelectorAll(".vzd-compass-eyebrow")).map(e => e.textContent);
    expect(eyebrows).toEqual(["1Challenge", "2North Star", "3Solution & Test Ideas", "4Go-To-Market / Pricing"]);
  });

  it("renders forces, a problem, ideas, and gtm/pricing lines", () => {
    const el = render(SRC);
    expect(Array.from(el.querySelectorAll(".vzd-compass-force")).map(f => f.textContent)).toContain("Users abandon setup");
    expect(el.querySelector(".vzd-compass-problem")?.textContent).toContain("Can't reach first value");
    expect(el.querySelectorAll(".vzd-compass-idea")).toHaveLength(2);
    expect(el.querySelectorAll(".vzd-compass-line")).toHaveLength(2); // gtm + pricing
  });

  it("renders insights as stat tiles, with a figure only when the line splits on |", () => {
    const el = render(SRC);
    const tiles = el.querySelectorAll(".vzd-compass-stat");
    expect(tiles).toHaveLength(2);
    expect(tiles[0].querySelector(".vzd-compass-stat-figure")?.textContent).toBe("40%");
    expect(tiles[1].querySelector(".vzd-compass-stat-figure")).toBeNull();
  });

  it("renders the north star as a banner", () => {
    const el = render(SRC);
    expect(el.querySelector(".vzd-compass-northstar-text")?.textContent).toBe("50% activate in day one");
  });

  it("read mode: no edit affordances", () => {
    const el = render(SRC);
    expect(el.querySelectorAll(".vzd-compass-add, .vzd-compass-del")).toHaveLength(0);
  });

  it("edit mode: shows add + delete affordances", () => {
    // fakeApp reports source mode → isEditModeActive true; ctx + source present.
    const app = { workspace: { getActiveViewOfType: () => ({ getMode: () => "source" }) } } as never;
    const ctx = { sourcePath: "n.md" } as never;
    const el = render(SRC, { app, ctx, source: `type: compass\n${SRC}` });
    expect(el.querySelectorAll(".vzd-compass-add").length).toBeGreaterThan(0);
    expect(el.querySelectorAll(".vzd-compass-del").length).toBeGreaterThan(0);
  });

  it("renders section placeholders when empty in read mode", () => {
    const el = render("title: Empty");
    expect(el.querySelectorAll(".vzd-compass-placeholder").length).toBe(4);
  });
});
