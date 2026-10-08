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

// Editable path: report Live Preview, record write-backs, capture menus.
vi.mock("../shared/editor", async (orig) => ({
  ...(await orig<typeof import("../shared/editor")>()),
  isEditModeActive: () => true,
}));
const edits = vi.hoisted(() => ({
  writeProContraArgText: vi.fn((..._args: unknown[]) => true),
  writeProContraArgWeight: vi.fn((..._args: unknown[]) => true),
  flipProContraArg: vi.fn((..._args: unknown[]) => true),
  removeProContraArg: vi.fn((..._args: unknown[]) => true),
  insertProContraArg: vi.fn((..._args: unknown[]) => true),
  insertProContraOption: vi.fn((..._args: unknown[]) => true),
  removeProContraOption: vi.fn((..._args: unknown[]) => true),
  renameProContraOption: vi.fn((..._args: unknown[]) => true),
  writeProContraField: vi.fn((..._args: unknown[]) => true),
}));
vi.mock("../shared/procontra-edit", () => edits);
type Menu = { label: string; actions: () => { title: string; onChoose: () => void }[] };
const menus = vi.hoisted(() => [] as Menu[]);
vi.mock("../shared/item-menu", () => ({
  attachItemMenu: (_host: Element, opts: Menu & { button?: { parent: HTMLElement; cls: string } }) => {
    menus.push(opts);
    const button = opts.button ? opts.button.parent.createEl("button", { cls: opts.button.cls }) : null;
    return { button, open: () => {} };
  },
}));

function render(source: string): HTMLElement {
  const r = parseProContra(source);
  if (!r.ok) throw new Error(r.error);
  const el = document.createElement("div");
  document.body.appendChild(el);
  renderProContra(r.data, el, {}); // no app/ctx → read-only
  return el;
}

const text = (el: Element | null): string => el?.textContent ?? "";

beforeEach(() => {
  document.body.innerHTML = "";
  menus.length = 0;
  Object.values(edits).forEach(f => { f.mockClear(); f.mockReturnValue(true); });
});

function renderEditable(source: string): HTMLElement {
  const r = parseProContra(source);
  if (!r.ok) throw new Error(r.error);
  const el = document.createElement("div");
  document.body.appendChild(el);
  renderProContra(r.data, el, { app: {} as never, ctx: {} as never, source });
  return el;
}

const menuFor = (label: string): Menu => {
  const m = menus.find(x => x.label.includes(label));
  if (!m) throw new Error(`no menu for ${label}`);
  return m;
};
const choose = (label: string, title: string): void => {
  const action = menuFor(label).actions().find(a => a.title === title);
  if (!action) throw new Error(`no "${title}" in menu for ${label}`);
  action.onChoose();
};

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
    expect(el.querySelector(".vzd-pc-dots")?.getAttribute("role")).toBe("img");
    expect(el.querySelector(".vzd-pc-dots")?.getAttribute("aria-label")).toBe("Weight 3 of 3");
    expect(el.querySelector(".vzd-add")).toBeNull();
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

describe("renderProContra — editable (Live Preview)", () => {
  const SRC = "option: A\n  pro: alpha | 2\n  con: beta\noption: B\n  pro: gamma\ndecision: A";

  it("adds arguments with the option's ref and side, and options with a unique name", () => {
    const el = renderEditable(SRC);
    const [a, b] = Array.from(el.querySelectorAll<HTMLElement>(".vzd-pc-option"));
    a.querySelector<HTMLElement>(".vzd-pc-col--con .vzd-add")!.click();
    b.querySelector<HTMLElement>(".vzd-pc-col--pro .vzd-add")!.click();
    expect(edits.insertProContraArg.mock.calls.map(c => [c[3], c[4]])).toEqual([[0, "con"], [1, "pro"]]);

    renderEditable("option: New option\noption: New option 2").querySelector<HTMLElement>(".vzd-pc-add-option")!.click();
    expect(edits.insertProContraOption.mock.calls.at(-1)?.[3]).toBe("New option 3");
  });

  it("adds to the implicit option (ref -1) on an empty board", () => {
    renderEditable("title: T").querySelector<HTMLElement>(".vzd-pc-col--pro .vzd-add")!.click();
    expect(edits.insertProContraArg.mock.calls[0].slice(3, 5)).toEqual([-1, "pro"]);
  });

  it("wires argument menus to the argument's own ref", () => {
    renderEditable(SRC);
    choose("gamma", "Move to Contra");
    choose("beta", "Delete argument");
    expect(edits.flipProContraArg.mock.calls[0][3]).toBe(2);
    expect(edits.removeProContraArg.mock.calls[0][3]).toBe(1);
  });

  it("offers choose / clear on option menus", () => {
    renderEditable(SRC);
    choose("Actions for B", "Choose this option");
    expect(edits.writeProContraField.mock.calls.at(-1)?.slice(3)).toEqual(["decision", "B"]);
    choose("Actions for A", "Clear decision");
    expect(edits.writeProContraField.mock.calls.at(-1)?.slice(3)).toEqual(["decision", ""]);
    choose("Actions for B", "Delete option");
    expect(edits.removeProContraOption.mock.calls[0][3]).toBe(1);
  });

  it("badges only the first of two same-named options", () => {
    const el = renderEditable("option: X\npro: a\noption: X\npro: b\ndecision: X");
    expect(el.querySelectorAll(".vzd-pc-option.is-chosen")).toHaveLength(1);
    expect(el.querySelector(".vzd-pc-option")?.classList.contains("is-chosen")).toBe(true);
  });

  it("sets a weight by click or keyboard, and rolls back when the write fails", () => {
    const el = renderEditable(SRC);
    const slider = el.querySelector<HTMLElement>(".vzd-pc-dots")!; // alpha, weight 2
    expect(slider.getAttribute("role")).toBe("slider");
    expect(slider.getAttribute("tabindex")).toBe("0");

    (slider.children[2] as HTMLElement).click();
    expect(edits.writeProContraArgWeight.mock.calls[0].slice(3)).toEqual([0, 3]);
    expect(slider.getAttribute("aria-valuenow")).toBe("3");

    slider.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
    expect(edits.writeProContraArgWeight.mock.calls[1].slice(3)).toEqual([0, 1]);

    edits.writeProContraArgWeight.mockReturnValue(false);
    slider.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(slider.getAttribute("aria-valuenow")).toBe("1");
    expect(slider.querySelectorAll(".is-filled")).toHaveLength(1);
  });

  it("marks the board editable so the menu gutter is reserved", () => {
    expect(renderEditable(SRC).querySelector(".vzd-pc")?.classList.contains("vzd-pc--editable")).toBe(true);
    expect(render(SRC).querySelector(".vzd-pc")?.classList.contains("vzd-pc--editable")).toBe(false);
  });
});
