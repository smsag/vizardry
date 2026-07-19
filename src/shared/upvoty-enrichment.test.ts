// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import "../test-setup";

vi.mock("obsidian", () => ({ setIcon: vi.fn() }));
const { mockGetUpvotyService } = vi.hoisted(() => ({
  mockGetUpvotyService: vi.fn((): { isEnabled(): boolean } | null => null),
}));
vi.mock("../upvoty", () => ({ getUpvotyService: mockGetUpvotyService }));
vi.mock("../i18n", () => ({ t: (key: string) => key }));

import { enrichUpvotyKeys, buildKeyRegex, renderUpvotyKeyBadge } from "./upvoty-enrichment";

describe("enrichUpvotyKeys", () => {
  it("does nothing when the Upvoty service is unavailable (integration disabled)", () => {
    const el = document.createElement("div");
    el.textContent = "See UPV-abcdefghij1234567890 for details";
    enrichUpvotyKeys(el);
    expect(el.querySelector(".vzd-upvoty-key")).toBeNull();
  });
});

describe("buildKeyRegex", () => {
  it("matches a base62 slug key with the given prefix", () => {
    const re = buildKeyRegex("UPV");
    const match = re.exec("Ref: UPV-abcdefghij1234567890 done");
    expect(match?.[1]).toBe("UPV-abcdefghij1234567890");
  });

  it("matches a UUID-form key", () => {
    const re = buildKeyRegex("UPV");
    const match = re.exec("Ref: UPV-5ffcaa11-2233-4455-6677-8899aabbccdd done");
    expect(match?.[1]).toBe("UPV-5ffcaa11-2233-4455-6677-8899aabbccdd");
  });

  it("escapes regex-special characters in a custom prefix", () => {
    const re = buildKeyRegex("A+B");
    const match = re.exec("A+B-abcdefghij1234567890");
    expect(match?.[1]).toBe("A+B-abcdefghij1234567890");
  });
});

describe("renderUpvotyKeyBadge", () => {
  it("renders a .vzd-upvoty-key badge when the Upvoty integration is enabled", () => {
    mockGetUpvotyService.mockReturnValue({ isEnabled: () => true });
    const el = document.createElement("div");
    renderUpvotyKeyBadge(el, "UPV-abc123");

    const badge = el.querySelector(".vzd-upvoty-key");
    expect(badge).toBeTruthy();
    expect(badge?.textContent).toBe("UPV-abc123");
  });

  it("renders nothing when the Upvoty integration is disabled", () => {
    mockGetUpvotyService.mockReturnValue({ isEnabled: () => false });
    const el = document.createElement("div");
    renderUpvotyKeyBadge(el, "UPV-abc123");

    expect(el.querySelector(".vzd-upvoty-key")).toBeNull();
  });

  it("renders nothing when the Upvoty service isn't configured at all", () => {
    mockGetUpvotyService.mockReturnValue(null);
    const el = document.createElement("div");
    renderUpvotyKeyBadge(el, "UPV-abc123");

    expect(el.querySelector(".vzd-upvoty-key")).toBeNull();
  });
});
