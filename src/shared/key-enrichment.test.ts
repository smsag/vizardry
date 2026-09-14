// @vitest-environment happy-dom
/**
 * Cross-module regression test: Linear and Upvoty enrichment previously each
 * kept their own popover z-index counter (Linear starting at 1000, Upvoty at
 * 2000), so their popovers didn't stack predictably relative to each other
 * when both were open. Both now go through the same shared registry in
 * key-enrichment.ts.
 */
import "../test-setup";
import { describe, it, expect, vi } from "vitest";

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

import { formatKeyAge } from "./key-enrichment";
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

