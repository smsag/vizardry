// @vitest-environment happy-dom
import "../test-setup";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { parseProContra } from "../procontra";
import { renderProContra } from "./procontra";
import { PRO_CONTRA_TEMPLATE } from "../templates";

vi.mock("obsidian", async (orig) => {
  const actual = await orig<typeof import("obsidian")>();
  return { ...actual, MarkdownView: class MarkdownView {} };
});

function render(source: string): HTMLElement {
  const r = parseProContra(source);
  if (!r.ok) throw new Error(r.error);
  const el = document.createElement("div");
  document.body.appendChild(el);
  renderProContra(r.data, el, {}); // no app/ctx → read-only
  return el;
}

const text = (el: Element | null): string => el?.textContent ?? "";

beforeEach(() => { document.body.innerHTML = ""; });

describe("renderProContra — single option (T-chart)", () => {
  const SRC = "question: Buy a car?\npro: Freedom | 3\ncon: Cost | 2\ncon: Parking";

  it("renders the question, two columns and no option header", () => {
    const el = render(SRC);
    expect(text(el.querySelector(".vzd-pc-question"))).toBe("Buy a car?");
    expect(el.querySelector(".vzd-pc-single")).not.toBeNull();
    expect(el.querySelector(".vzd-pc-option-head")).toBeNull();
    expect(el.querySelectorAll(".vzd-pc-col--pro .vzd-pc-item")).toHaveLength(1);
    expect(el.querySelectorAll(".vzd-pc-col--con .vzd-pc-item")).toHaveLength(2);
  });

  it("shows column totals, weight dots and a balanced verdict", () => {
    const el = render(SRC);
    expect(text(el.querySelector(".vzd-pc-col--pro .vzd-pc-col-total"))).toBe("3");
    expect(text(el.querySelector(".vzd-pc-col--con .vzd-pc-col-total"))).toBe("3");
    expect(el.querySelectorAll(".vzd-pc-col--pro .vzd-pc-dot.is-filled")).toHaveLength(3);
    expect(text(el.querySelector(".vzd-pc-net"))).toBe("±0");
    expect(el.querySelector(".vzd-pc-balance")?.classList.contains("is-even")).toBe(true);
  });

  it("is read-only without an editor: no add buttons, menus or decision chip", () => {
    const el = render(SRC);
    expect(el.querySelector(".vzd-pc-add")).toBeNull();
    expect(el.querySelector(".vzd-pc-item-menu")).toBeNull();
    expect(el.querySelector(".vzd-pc-decision")).toBeNull();
  });

  it("renders an empty board for an empty block", () => {
    const el = render("title: Nothing yet");
    expect(el.querySelectorAll(".vzd-pc-col")).toHaveLength(2);
    expect(text(el.querySelector(".vzd-pc-balance-label"))).toBe("No arguments yet");
  });
});

describe("renderProContra — several options", () => {
  it("renders the template as cards, badging the decision", () => {
    const src = PRO_CONTRA_TEMPLATE.split("\n").slice(1, -2).join("\n");
    const el = render(src);
    const cards = Array.from(el.querySelectorAll(".vzd-pc-options .vzd-pc-option"));
    expect(cards.map(c => text(c.querySelector(".vzd-pc-option-name")))).toEqual(["Move to Berlin", "Stay remote"]);
    expect(cards[0].classList.contains("is-chosen")).toBe(true);
    expect(text(cards[0].querySelector(".vzd-pc-badge"))).toBe("Chosen");
    expect(text(el.querySelector(".vzd-pc-decision .vizardry-period-value"))).toBe("Move to Berlin");
  });

  it("marks a unique leader when nothing is chosen, and signs the net score", () => {
    const el = render("option: A\npro: x | 3\noption: B\ncon: y | 2");
    const [a, b] = Array.from(el.querySelectorAll(".vzd-pc-option"));
    expect(a.classList.contains("is-leading")).toBe(true);
    expect(text(a.querySelector(".vzd-pc-badge--leading"))).toBe("Leading");
    expect(b.classList.contains("is-leading")).toBe(false);
    expect(text(a.querySelector(".vzd-pc-net"))).toBe("+3");
    expect(text(b.querySelector(".vzd-pc-net"))).toBe("−2");
  });

  it("marks no leader on a tie", () => {
    const el = render("option: A\npro: x\noption: B\npro: y");
    expect(el.querySelector(".is-leading")).toBeNull();
  });

  it("labels an implicit option next to named ones as untitled", () => {
    const el = render("pro: orphan\noption: Named\npro: x");
    expect(text(el.querySelector(".vzd-pc-option-name"))).toBe("Untitled option");
  });

  it("surfaces parser warnings as chips", () => {
    const el = render("pro: x\nmood: great");
    expect(el.querySelector(".vzd-canvas-warning-chip")?.getAttribute("title")).toContain('unknown field "mood"');
  });
});
