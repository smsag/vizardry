// @vitest-environment happy-dom
import "../test-setup";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { parseJourney } from "../journey";
import { renderJourneyMap } from "./journey";

vi.mock("obsidian", async (orig) => {
  const actual = await orig<typeof import("obsidian")>();
  return { ...actual, MarkdownView: class MarkdownView {} };
});

function render(source: string, rc = {}): HTMLElement {
  const r = parseJourney(source);
  if (!r.ok) throw new Error(r.error);
  const el = document.createElement("div");
  document.body.appendChild(el);
  renderJourneyMap(r.data, el, rc);
  return el;
}

beforeEach(() => { document.body.innerHTML = ""; });

const SRC = [
  "phase: A", "  feeling: Lost", "  mood: -2",
  "phase: B", "  feeling: Fine",
  "phase: C", "  feeling: Glad", "  mood: 1",
  "phase: D", "  mood: 2",
].join("\n");

describe("renderJourneyMap — emotion curve", () => {
  it("draws the mood lane right above Thoughts & Feelings", () => {
    const el = render(SRC);
    const keys = [...el.querySelectorAll<HTMLElement>(".vzd-journey-lane-row")].map(r => r.dataset.laneKey);
    expect(keys.indexOf("mood")).toBe(keys.indexOf("feeling") - 1);
  });

  it("marks each phase's mood with a signed, toned point, and none where it is unset", () => {
    const el = render(SRC);
    const cells = [...el.querySelectorAll(".vzd-journey-mood-cell")];
    expect(cells).toHaveLength(4);
    const points = cells.map(c => c.querySelector(".vzd-journey-mood-point"));
    expect(points.map(p => p?.textContent ?? null)).toEqual(["−2", null, "+1", "+2"]);
    expect(points[0]!.getAttribute("data-vzd-tone")).toBe("negative");
    expect(points[2]!.getAttribute("data-vzd-tone")).toBe("positive");
  });

  it("joins only neighbouring phases that both have a mood", () => {
    const el = render(SRC);
    const paths = [...el.querySelectorAll(".vzd-journey-mood-cell")].map(c =>
      c.querySelector(".vzd-journey-mood-line")?.getAttribute("d") ?? "");
    // A has no mooded neighbour (B is unset), C joins D, D joins C.
    expect(paths[0]).toBe("");
    expect(paths[2]).toMatch(/^M 50 /);
    expect(paths[3]).toMatch(/^M 0 /);
  });

  it("leaves the lane out when no phase has a mood (Reading View)", () => {
    const el = render("phase: A\n  feeling: Lost");
    expect(el.querySelector(".vzd-journey-mood-row")).toBeNull();
  });
});
