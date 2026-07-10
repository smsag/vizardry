// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";

vi.mock("obsidian", () => ({ setIcon: vi.fn() }));
vi.mock("../linear", () => ({ getLinearService: () => null }));
vi.mock("../i18n", () => ({ t: (key: string) => key }));

import { enrichLinearKeys } from "./linear-enrichment";

describe("enrichLinearKeys", () => {
  it("wraps a Linear key in plain text with a clickable badge", () => {
    const el = document.createElement("div");
    el.textContent = "See CORE-1234 for details";
    enrichLinearKeys(el);

    const badge = el.querySelector(".vzd-linear-key");
    expect(badge).toBeTruthy();
    expect(badge?.textContent).toBe("CORE-1234");
  });

  it("does not wrap a Linear key inside a link, to avoid nesting a button inside an anchor", () => {
    const el = document.createElement("div");
    el.innerHTML = '<a href="https://example.com">Fix CORE-1234 bug</a>';
    enrichLinearKeys(el);

    expect(el.querySelector(".vzd-linear-key")).toBeNull();
    expect(el.querySelector("a")?.textContent).toBe("Fix CORE-1234 bug");
  });

  it("still enriches keys outside the link in the same container", () => {
    const el = document.createElement("div");
    el.innerHTML = 'CORE-1 outside, <a href="#">CORE-2 inside link</a>';
    enrichLinearKeys(el);

    const badges = Array.from(el.querySelectorAll(".vzd-linear-key")).map(b => b.textContent);
    expect(badges).toEqual(["CORE-1"]);
  });
});
