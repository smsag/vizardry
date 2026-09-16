// @vitest-environment happy-dom
/**
 * The sideleaf's card lifecycle: what opens a card, what is allowed to close
 * one, and what survives a restart.
 */
import "../test-setup";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("obsidian", async () => {
  const actual = await vi.importActual<typeof import("../__mocks__/obsidian")>("../__mocks__/obsidian");
  return actual;
});
// Cards render asynchronously from the services; neither is enabled here, so
// each card settles on its "integration disabled" body. This suite is about
// the leaf, not the fetch.
vi.mock("../linear", () => ({ getLinearService: () => null }));
vi.mock("../upvoty", () => ({ getUpvotyService: () => null }));

import { WorkspaceLeaf } from "../__mocks__/obsidian";
import { VizardrySideleafView } from "./view";
import { resetKeyOpenState, registerKeyBadge, isKeyOpen, KEY_OPEN_CLASS } from "../shared/key-open-state";

const LINEAR = { service: "linear", key: "CORE-1234" } as const;
const OTHER  = { service: "linear", key: "CORE-9999" } as const;
const UPVOTY = { service: "upvoty", key: "UPV-abc123def456" } as const;

async function makeView(): Promise<VizardrySideleafView> {
  const view = new VizardrySideleafView(new WorkspaceLeaf() as never);
  await view.onOpen();
  return view;
}

const cardEls = (v: VizardrySideleafView): Element[] =>
  Array.from(v.contentEl.querySelectorAll(".vzd-card"));

beforeEach(() => resetKeyOpenState());

describe("opening cards", () => {
  it("renders a card per distinct key", async () => {
    const v = await makeView();
    v.openCard(LINEAR);
    v.openCard(UPVOTY);
    expect(cardEls(v)).toHaveLength(2);
  });

  it("shows the newest card first", async () => {
    const v = await makeView();
    v.openCard(LINEAR);
    v.openCard(OTHER);
    expect(cardEls(v)[0].getAttribute("data-card-id")).toBe("linear:CORE-9999");
  });

  it("surfaces the existing card instead of stacking a duplicate", async () => {
    // The same ticket is typically mentioned in several notes; clicking it
    // twice must not leave the user with two cards to close.
    const v = await makeView();
    v.openCard(LINEAR);
    v.openCard(LINEAR);
    expect(cardEls(v)).toHaveLength(1);
  });

  it("marks every badge for the key as open", async () => {
    const v = await makeView();
    const badge = document.createElement("button");
    registerKeyBadge("linear:CORE-1234", badge);

    v.openCard(LINEAR);

    expect(isKeyOpen("linear:CORE-1234")).toBe(true);
    expect(badge.classList.contains(KEY_OPEN_CLASS)).toBe(true);
  });

  it("hides the empty state once a card is present", async () => {
    const v = await makeView();
    const empty = v.contentEl.querySelector(".vzd-sideleaf-empty")!;
    expect(empty.classList.contains("is-visible")).toBe(true);
    v.openCard(LINEAR);
    expect(empty.classList.contains("is-visible")).toBe(false);
  });
});

describe("closing cards", () => {
  it("removes only the card asked for, and clears its badge marker", async () => {
    const v = await makeView();
    const badge = document.createElement("button");
    registerKeyBadge("linear:CORE-1234", badge);
    v.openCard(LINEAR);
    v.openCard(OTHER);

    v.closeCard("linear:CORE-1234");

    expect(cardEls(v)).toHaveLength(1);
    expect(cardEls(v)[0].getAttribute("data-card-id")).toBe("linear:CORE-9999");
    expect(isKeyOpen("linear:CORE-1234")).toBe(false);
    expect(badge.classList.contains(KEY_OPEN_CLASS)).toBe(false);
  });

  it("gives each card an actions trigger that announces a menu", async () => {
    // Removal moved behind the shared actions menu; the menu's own behaviour
    // is covered in shared/item-menu.test.ts. What matters here is that every
    // card carries a labelled trigger.
    const v = await makeView();
    v.openCard(LINEAR);
    const trigger = cardEls(v)[0].querySelector(".vzd-card-menu")!;
    expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
    expect(trigger.getAttribute("aria-label")).toBeTruthy();
  });

  it("ignores a close for a card that is not open", async () => {
    const v = await makeView();
    v.openCard(LINEAR);
    v.closeCard("linear:NOPE-1");
    expect(cardEls(v)).toHaveLength(1);
  });

  it("does not drop a card when the note that opened it goes away", async () => {
    // The whole point of the leaf: a card outlives its badge. Nothing here
    // unregisters it, so removing the badge must leave the card standing.
    const v = await makeView();
    const badge = document.createElement("button");
    document.body.appendChild(badge);
    registerKeyBadge("linear:CORE-1234", badge);
    v.openCard(LINEAR);

    badge.remove();

    expect(cardEls(v)).toHaveLength(1);
  });
});

describe("clear all", () => {
  it("removes every card and every marker", async () => {
    const v = await makeView();
    const badge = document.createElement("button");
    registerKeyBadge("linear:CORE-1234", badge);
    v.openCard(LINEAR);
    v.openCard(UPVOTY);

    v.clearAll();

    expect(cardEls(v)).toHaveLength(0);
    expect(isKeyOpen("linear:CORE-1234")).toBe(false);
    expect(badge.classList.contains(KEY_OPEN_CLASS)).toBe(false);
  });

  it("is wired to the header button", async () => {
    const v = await makeView();
    v.openCard(LINEAR);
    (v.contentEl.querySelector(".vzd-sideleaf-clear") as HTMLElement).click();
    expect(cardEls(v)).toHaveLength(0);
  });

  it("brings the empty state back", async () => {
    const v = await makeView();
    v.openCard(LINEAR);
    v.clearAll();
    expect(v.contentEl.querySelector(".vzd-sideleaf-empty")!.classList.contains("is-visible")).toBe(true);
  });
});

describe("persistence across a restart", () => {
  it("round-trips the open cards, newest still first", async () => {
    const a = await makeView();
    a.openCard(LINEAR);
    a.openCard(UPVOTY);

    const b = await makeView();
    await b.setState(a.getState(), {});

    expect(b.cardIds()).toEqual(a.cardIds());
    expect(cardEls(b)[0].getAttribute("data-card-id")).toBe("upvoty:UPV-abc123def456");
  });

  it("restores the badge markers too", async () => {
    const a = await makeView();
    a.openCard(LINEAR);
    const state = a.getState();

    resetKeyOpenState();
    const badge = document.createElement("button");
    registerKeyBadge("linear:CORE-1234", badge);

    const b = await makeView();
    await b.setState(state, {});

    expect(badge.classList.contains(KEY_OPEN_CLASS)).toBe(true);
  });

  it("replaces whatever was showing rather than merging into it", async () => {
    const v = await makeView();
    v.openCard(OTHER);
    await v.setState({ cards: ["linear:CORE-1234"] }, {});
    expect(v.cardIds()).toEqual(["linear:CORE-1234"]);
  });

  it("drops unusable ids and keeps the rest", async () => {
    // workspace.json is user-editable and may predate this feature.
    const v = await makeView();
    await v.setState({ cards: ["linear:CORE-1234", "jira:ABC-1", "", 7, null] }, {});
    expect(v.cardIds()).toEqual(["linear:CORE-1234"]);
  });

  it("leaves the cards alone when the state carries no card list", async () => {
    const v = await makeView();
    v.openCard(LINEAR);
    await v.setState({}, {});
    expect(cardEls(v)).toHaveLength(1);
  });
});

describe("the undo window", () => {
  const undoEl = (v: VizardrySideleafView) => v.contentEl.querySelector(".vzd-sideleaf-undo")!;
  const undoBtn = (v: VizardrySideleafView) =>
    v.contentEl.querySelector(".vzd-sideleaf-undo-btn") as HTMLElement | null;

  it("stays hidden until something is removed", async () => {
    const v = await makeView();
    v.openCard(LINEAR);
    expect(undoEl(v).classList.contains("is-visible")).toBe(false);
  });

  it("offers an undo after closing a card, and puts it back", async () => {
    const v = await makeView();
    v.openCard(LINEAR);
    v.closeCard("linear:CORE-1234");
    expect(cardEls(v)).toHaveLength(0);
    expect(undoEl(v).classList.contains("is-visible")).toBe(true);

    undoBtn(v)!.click();

    expect(cardEls(v)).toHaveLength(1);
    expect(isKeyOpen("linear:CORE-1234")).toBe(true);
    expect(undoEl(v).classList.contains("is-visible")).toBe(false);
  });

  it("puts every card back after Clear all, in the order they were shown", async () => {
    const v = await makeView();
    v.openCard(LINEAR);
    v.openCard(UPVOTY);
    const before = v.cardIds();

    v.clearAll();
    expect(cardEls(v)).toHaveLength(0);
    undoBtn(v)!.click();

    expect(v.cardIds()).toEqual(before);
  });

  it("closes the window once it expires, leaving the removal permanent", async () => {
    vi.useFakeTimers();
    const v = await makeView();
    v.openCard(LINEAR);
    v.closeCard("linear:CORE-1234");
    vi.advanceTimersByTime(10_001);
    expect(undoEl(v).classList.contains("is-visible")).toBe(false);
    expect(cardEls(v)).toHaveLength(0);
    vi.useRealTimers();
  });

  it("does not offer an undo for a workspace restore", async () => {
    // setState replaces what is on screen; that is not a removal the user
    // made, so there must be no offer to put the previous cards back.
    const v = await makeView();
    v.openCard(LINEAR);
    await v.setState({ cards: ["upvoty:UPV-abc123def456"] }, {});
    expect(undoEl(v).classList.contains("is-visible")).toBe(false);
  });
});

describe("the leaf's identity", () => {
  it("uses Vizardry's own icon, the one the ribbon and entry commands share", async () => {
    // The leaf used to borrow layout-template, a generic Lucide glyph; the
    // plugin's mark is registered under its own id and used everywhere it
    // shows up, so the tab, the ribbon and the palette all say Vizardry.
    const v = await makeView();
    expect(v.getIcon()).toBe("vizardry-logo");
    expect(v.getIcon()).not.toBe("layout-template");
  });
});

