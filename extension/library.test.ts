// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";

vi.mock("obsidian", async () => await import("./obsidian.shim"));
vi.stubGlobal("__VIZARDRY_VERSION__", "0.0.0-test");

const { render, getCanvases } = await import("./library");

describe("library render", () => {
  it("draws a canvas and reports no error", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const result = render("type: swot\nblock: Strengths\n  Fast", host);
    expect(result.error).toBeUndefined();
    expect(getCanvases(host)).toHaveLength(1);
  });

  it("names the error for a source without a type, and clears it on the next render", () => {
    const host = document.createElement("div");
    expect(render("block: Strengths", host).error).toMatch(/type:/);
    expect(render("type: swot\nblock: Strengths\n  Fast", host).error).toBeUndefined();
    expect(host.classList.contains("vizardry-error")).toBe(false);
  });
});
