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
