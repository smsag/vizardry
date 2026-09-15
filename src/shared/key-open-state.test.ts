// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import {
  KEY_OPEN_CLASS, registerKeyBadge, unregisterKeyBadge,
  setKeyOpen, clearAllKeyOpen, isKeyOpen, resetKeyOpenState,
} from "./key-open-state";

const badge = (): HTMLElement => document.createElement("button");
const isMarked = (b: HTMLElement): boolean =>
  b.classList.contains(KEY_OPEN_CLASS) && b.getAttribute("aria-expanded") === "true";

beforeEach(() => resetKeyOpenState());

describe("key open state", () => {
  it("marks a newly registered badge as collapsed", () => {
    const b = badge();
    registerKeyBadge("linear:CORE-1", b);
    expect(b.getAttribute("aria-expanded")).toBe("false");
    expect(b.classList.contains(KEY_OPEN_CLASS)).toBe(false);
  });

  it("lights every badge for the same key at once", () => {
    // One ticket can be named in five notes; all of those badges point at the
    // single card, so they light together. The old per-anchor model could not
    // express this.
    const a = badge(), b = badge(), other = badge();
    registerKeyBadge("linear:CORE-1", a);
    registerKeyBadge("linear:CORE-1", b);
    registerKeyBadge("linear:CORE-2", other);

    setKeyOpen("linear:CORE-1", true);

    expect(isMarked(a)).toBe(true);
    expect(isMarked(b)).toBe(true);
    expect(isMarked(other)).toBe(false);
  });

  it("gives a badge registered later the state its key already has", () => {
    // A note rendered after the card was opened must still show the marker.
    setKeyOpen("linear:CORE-1", true);
    const late = badge();
    registerKeyBadge("linear:CORE-1", late);
    expect(isMarked(late)).toBe(true);
  });

  it("clears the marker when the card closes", () => {
    const b = badge();
    registerKeyBadge("linear:CORE-1", b);
    setKeyOpen("linear:CORE-1", true);
    setKeyOpen("linear:CORE-1", false);
    expect(isMarked(b)).toBe(false);
    expect(isKeyOpen("linear:CORE-1")).toBe(false);
  });

  it("clears every key at once for 'Clear all'", () => {
    const a = badge(), b = badge();
    registerKeyBadge("linear:CORE-1", a);
    registerKeyBadge("upvoty:UPV-x", b);
    setKeyOpen("linear:CORE-1", true);
    setKeyOpen("upvoty:UPV-x", true);

    clearAllKeyOpen();

    expect(isMarked(a)).toBe(false);
    expect(isMarked(b)).toBe(false);
  });

  it("stops updating a badge once it is unregistered", () => {
    // A re-rendered note drops its badges; they must not be held or written to.
    const b = badge();
    registerKeyBadge("linear:CORE-1", b);
    unregisterKeyBadge("linear:CORE-1", b);
    setKeyOpen("linear:CORE-1", true);
    expect(isMarked(b)).toBe(false);
  });

  it("keeps the key open when only one of its badges goes away", () => {
    const a = badge(), b = badge();
    registerKeyBadge("linear:CORE-1", a);
    registerKeyBadge("linear:CORE-1", b);
    setKeyOpen("linear:CORE-1", true);

    unregisterKeyBadge("linear:CORE-1", a);

    expect(isKeyOpen("linear:CORE-1")).toBe(true);
    expect(isMarked(b)).toBe(true);
  });
});
