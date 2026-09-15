// @vitest-environment happy-dom
/**
 * Cross-module regression test: Linear and Upvoty enrichment previously each
 * kept their own popover z-index counter (Linear starting at 1000, Upvoty at
 * 2000), so their popovers didn't stack predictably relative to each other
 * when both were open. Both now go through the same shared registry in
 * key-enrichment.ts.
 */
import "../test-setup";
import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("obsidian", () => ({ setIcon: vi.fn() }));
vi.mock("../i18n", () => ({ t: (key: string) => key }));
vi.mock("../linear", () => ({
  getLinearService: () => ({
    isEnabled: () => true,
    getSummary: () => new Promise(() => {}), // never resolves; only z-index matters here
  }),
}));
vi.mock("../upvoty", () => ({
  getUpvotyService: () => ({
    isEnabled: () => true,
    getKeyPrefix: () => "UPV",
    getAppUrl: () => "https://app.upvoty.com/feedback",
    getSummary: () => new Promise(() => {}),
  }),
}));

import { formatKeyAge, setStatusColor, attachKeyTrigger, closeAllKeyPopovers, KEY_OPEN_CLASS } from "./key-enrichment";
import { enrichLinearKeys } from "./linear-enrichment";
import { enrichUpvotyKeys } from "./upvoty-enrichment";

function zIndexOf(el: Element): number {
  return Number((el as HTMLElement).style.zIndex);
}

describe("Linear/Upvoty popovers share one z-index stacking order", () => {
  it("a Linear popover opened after an Upvoty one ends up on top, continuing the same counter", () => {
    // Opening order matters for this regression: Upvoty's old counter base
    // (2000) started HIGHER than Linear's (1000), so "Upvoty always on top"
    // could look correct by coincidence regardless of open order. Opening
    // Upvoty FIRST and Linear SECOND is the case that only passes if the
    // counter is genuinely shared and increments across services.
    document.body.innerHTML = "";
    const container = document.createElement("div");
    document.body.appendChild(container);
    container.innerHTML = "See CORE-1234 and UPV-abcdefghij1234567890 for details";

    enrichLinearKeys(container);
    enrichUpvotyKeys(container);

    const linearBtn = container.querySelector<HTMLElement>(".vzd-linear-key")!;
    const upvotyBtn = container.querySelector<HTMLElement>(".vzd-upvoty-key")!;
    expect(linearBtn).toBeTruthy();
    expect(upvotyBtn).toBeTruthy();

    upvotyBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const upvotyPopover = document.body.querySelector(".vzd-upvoty-preview")!;
    expect(upvotyPopover).toBeTruthy();

    linearBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const linearPopover = document.body.querySelector(".vzd-linear-preview")!;
    expect(linearPopover).toBeTruthy();

    // Opened later, on top of the shared stack — not reset to a separate,
    // lower base that would leave it stuck behind the earlier Upvoty popover.
    expect(zIndexOf(linearPopover)).toBeGreaterThan(zIndexOf(upvotyPopover));
  });
});

describe("formatKeyAge", () => {
  it("formats recent, hour-scale and day-scale ages", () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-01-10T12:00:00Z"));
    expect(formatKeyAge("2026-01-10T11:30:00Z", "Updated")).toBe("Updated just now");
    expect(formatKeyAge("2026-01-10T06:00:00Z", "Updated")).toBe("Updated 6h ago");
    expect(formatKeyAge("2026-01-07T12:00:00Z", "Created")).toBe("Created 3d ago");
    now.mockRestore();
  });

  it("returns nothing for an absent or unparseable timestamp", () => {
    // Both API clients fall back to "" for a missing date; that used to render
    // in the popover footer as "Updated NaNd ago".
    expect(formatKeyAge("", "Updated")).toBe("");
    expect(formatKeyAge("not a date", "Updated")).toBe("");
  });

  it("does not render a negative age when the clock is skewed", () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-01-10T12:00:00Z"));
    expect(formatKeyAge("2026-01-10T13:00:00Z", "Updated")).toBe("Updated just now");
    now.mockRestore();
  });
});

describe("setStatusColor", () => {
  function el(): HTMLElement { return document.createElement("span"); }

  it("paints the rule in each hex form the APIs return", () => {
    for (const colour of ["#f2c94c", "#FFF", "#5ec269ff", "#abcd"]) {
      const e = el();
      setStatusColor(e, colour);
      expect(e.style.getPropertyValue("--vzd-status-color"), colour).toBe(colour);
    }
  });

  it("trims surrounding whitespace", () => {
    const e = el();
    setStatusColor(e, "  #f2c94c \n");
    expect(e.style.getPropertyValue("--vzd-status-color")).toBe("#f2c94c");
  });

  it("refuses anything that is not a plain hex colour", () => {
    // The value comes from a third-party API response and is written into a
    // CSS custom property, so it must not be able to smuggle in declarations.
    for (const bad of [
      "red; background: url(https://x/pixel.png)",
      "var(--anything)",
      "url(https://tracker.example/p.gif)",
      "expression(alert(1))",
      "#12345",
      "f2c94c",
      "",
      null,
      undefined,
    ]) {
      const e = el();
      setStatusColor(e, bad as string);
      expect(e.style.getPropertyValue("--vzd-status-color"), String(bad)).toBe("");
    }
  });

  it("clears a previously painted colour when a later value is rejected", () => {
    // A status that loses its colour must not keep the old one.
    const e = el();
    setStatusColor(e, "#f2c94c");
    setStatusColor(e, null);
    expect(e.style.getPropertyValue("--vzd-status-color")).toBe("");
  });
});

describe("key open state", () => {
  function trigger(): HTMLElement {
    const btn = document.createElement("button");
    document.body.appendChild(btn);
    attachKeyTrigger(btn, () => true, (onClose) => {
      const pop = document.createElement("div");
      const close = pop.appendChild(document.createElement("button"));
      close.addEventListener("click", onClose);
      return pop;
    });
    return btn;
  }

  afterEach(() => { closeAllKeyPopovers(); document.body.innerHTML = ""; });

  it("starts collapsed and announced as such", () => {
    // The badge is a disclosure button; before this it announced nothing.
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
  });

  it("marks itself open in both channels once its popover is up", () => {
    const btn = trigger();
    btn.click();
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    expect(btn.classList.contains(KEY_OPEN_CLASS)).toBe(true);
  });

  it("clears the open state when the popover is closed", () => {
    const btn = trigger();
    btn.click();
    (btn.ownerDocument.querySelector("body > div > button") as HTMLElement).click();
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    expect(btn.classList.contains(KEY_OPEN_CLASS)).toBe(false);
  });

  it("clears every key's open state when all popovers are closed at once", () => {
    const a = trigger(), b = trigger();
    a.click(); b.click();
    closeAllKeyPopovers();
    for (const btn of [a, b]) {
      expect(btn.getAttribute("aria-expanded")).toBe("false");
      expect(btn.classList.contains(KEY_OPEN_CLASS)).toBe(false);
    }
  });

  it("does not open a second popover for a key that already has one", () => {
    const btn = trigger();
    btn.click();
    btn.click();
    expect(document.querySelectorAll("body > div").length).toBe(1);
    expect(btn.getAttribute("aria-expanded")).toBe("true");
  });
});
