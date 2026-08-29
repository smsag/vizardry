// @vitest-environment happy-dom
import "../test-setup";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { parseFishbone } from "../fishbone";
import { renderFishbone } from "./fishbone";
import type { FishboneDiagram } from "../types";

vi.mock("obsidian", async (orig) => {
  const actual = await orig<typeof import("obsidian")>();
  return { ...actual, MarkdownView: class MarkdownView {} };
});

function render(source: string, variant?: string): HTMLElement {
  const r = parseFishbone(source, variant);
  if (!r.ok) throw new Error(r.error);
  const el = document.createElement("div");
  document.body.appendChild(el);
  renderFishbone(r.data as FishboneDiagram, el, {}); // no app/ctx → read-only
  return el;
}

beforeEach(() => { document.body.innerHTML = ""; });

const SRC = [
  "effect: High churn in month 1",
  "category: Product",
  "  cause: No guidance",
  "    subcause: Empty state",
  "  cause: Slow setup",
  "category: Process",
  "  cause: Manual handoffs",
].join("\n");

describe("renderFishbone (herringbone)", () => {
  it("draws a spine, an effect head, and one bone per category", () => {
    const el = render(SRC);
    expect(el.querySelectorAll(".vzd-fb-spine")).toHaveLength(1);
    expect(el.querySelectorAll(".vzd-fb-head")).toHaveLength(1);
    expect(el.querySelectorAll(".vzd-fb-rib")).toHaveLength(2);
    expect(el.querySelectorAll(".vzd-fb-catbox")).toHaveLength(2);
  });

  it("renders a label per cause and per sub-cause", () => {
    const el = render(SRC);
    const causes = Array.from(el.querySelectorAll(".vzd-fb-cause-label")).map(n => n.textContent);
    expect(causes).toEqual(["No guidance", "Slow setup", "Manual handoffs"]);
    const subs = Array.from(el.querySelectorAll(".vzd-fb-sub-label")).map(n => n.textContent);
    expect(subs).toEqual(["› Empty state"]);
  });

  it("shows all six 6M category bones from the preset", () => {
    const el = render("effect: Line stops", "6m");
    expect(el.querySelectorAll(".vzd-fb-catbox")).toHaveLength(6);
  });

  it("is read-only without app/ctx (no edit buttons)", () => {
    const el = render(SRC);
    expect(el.querySelectorAll(".vzd-tree-edit-add")).toHaveLength(0);
    expect(el.querySelectorAll(".vzd-tree-edit-del")).toHaveLength(0);
  });

  it("renders a warning chip for a recoverable parse issue", () => {
    const el = render("effect: E\ncause: orphan");
    expect(el.querySelector(".vzd-canvas-warning-chip")).toBeTruthy();
  });
});
