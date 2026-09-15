// @vitest-environment happy-dom
/**
 * The badge layer: scanning text for keys, and what a click does.
 *
 * The z-index stacking regression this file used to guard is gone with the
 * popovers — Linear and Upvoty no longer put floating elements on the page at
 * all, so there is no stacking order left to get wrong. What replaces it is
 * the assertion that a click reaches the sideleaf with the right ref.
 */
import "../test-setup";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("obsidian", () => ({ setIcon: vi.fn() }));
vi.mock("../i18n", () => ({ t: (key: string) => key }));

const openTicketCard = vi.fn();
vi.mock("../sideleaf", () => ({ openTicketCard: (...args: unknown[]) => openTicketCard(...args) }));

vi.mock("../linear", () => ({ getLinearService: () => ({ isEnabled: () => linearEnabled }) }));
vi.mock("../upvoty", () => ({
  getUpvotyService: () => ({ isEnabled: () => true, getKeyPrefix: () => "UPV" }),
}));

let linearEnabled = true;

import { enrichLinearKeys } from "./linear-enrichment";
import { enrichUpvotyKeys } from "./upvoty-enrichment";
import { KEY_OPEN_CLASS, resetKeyOpenState, setKeyOpen } from "./key-open-state";

function host(html: string): HTMLElement {
  const el = document.createElement("div");
  el.innerHTML = html;
  document.body.appendChild(el);
  return el;
}

beforeEach(() => {
  openTicketCard.mockClear();
  resetKeyOpenState();
  linearEnabled = true;
  document.body.innerHTML = "";
});

describe("enrichLinearKeys", () => {
  it("wraps a key in a badge", () => {
    const el = host("<p>Ship CORE-1234 today</p>");
    enrichLinearKeys(el);
    const badge = el.querySelector(".vzd-linear-key");
    expect(badge?.textContent).toBe("CORE-1234");
  });

  it("opens the card for that key when clicked", () => {
    const el = host("<p>Ship CORE-1234 today</p>");
    enrichLinearKeys(el);
    (el.querySelector(".vzd-linear-key") as HTMLElement).click();
    expect(openTicketCard).toHaveBeenCalledWith({ service: "linear", key: "CORE-1234" });
  });

  it("does nothing on click while the integration is off", () => {
    const el = host("<p>Ship CORE-1234 today</p>");
    enrichLinearKeys(el);
    linearEnabled = false;
    (el.querySelector(".vzd-linear-key") as HTMLElement).click();
    expect(openTicketCard).not.toHaveBeenCalled();
  });

  it("leaves text alone when it holds no key", () => {
    const el = host("<p>Nothing to see</p>");
    enrichLinearKeys(el);
    expect(el.querySelector(".vzd-linear-key")).toBeNull();
  });

  it("is safe to run twice over the same container", () => {
    const el = host("<p>Ship CORE-1234 today</p>");
    enrichLinearKeys(el);
    enrichLinearKeys(el);
    expect(el.querySelectorAll(".vzd-linear-key")).toHaveLength(1);
  });

  it("adopts the open marker for a key that already has a card", () => {
    // A note rendered while the card is already up must show the badge lit.
    setKeyOpen("linear:CORE-1234", true);
    const el = host("<p>Ship CORE-1234 today</p>");
    enrichLinearKeys(el);
    expect(el.querySelector(".vzd-linear-key")!.classList.contains(KEY_OPEN_CLASS)).toBe(true);
  });
});

describe("enrichUpvotyKeys", () => {
  it("opens the card with the full prefixed key", () => {
    const el = host("<p>See UPV-5OdEIWLP5WQ1B2z7TnjE1o please</p>");
    enrichUpvotyKeys(el);
    (el.querySelector(".vzd-upvoty-key") as HTMLElement).click();
    expect(openTicketCard).toHaveBeenCalledWith({
      service: "upvoty",
      key: "UPV-5OdEIWLP5WQ1B2z7TnjE1o",
    });
  });

  it("shortens the badge label but keeps the whole key for the card", () => {
    const el = host("<p>See UPV-5OdEIWLP5WQ1B2z7TnjE1o please</p>");
    enrichUpvotyKeys(el);
    expect(el.querySelector(".vzd-upvoty-key")!.textContent).toBe("UPV-5OdEIWLP…");
  });
});
