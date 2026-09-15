// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { formatKeyAge, setStatusColor } from "./key-format";

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
    // in the card footer as "Updated NaNd ago".
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
  const el = (): HTMLElement => document.createElement("span");

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
    const e = el();
    setStatusColor(e, "#f2c94c");
    setStatusColor(e, null);
    expect(e.style.getPropertyValue("--vzd-status-color")).toBe("");
  });
});
