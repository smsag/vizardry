/**
 * Guards the reachability contract for every item's `⋯` actions trigger, at
 * the stylesheet level.
 *
 * These controls were once hidden with `display: none` until their parent was
 * hovered, which made them impossible to reach on touch (no hover exists) and
 * impossible to reach by keyboard on any platform (`display: none` drops an
 * element from the tab order). Each canvas also styled its own copy, so the
 * fixes drifted apart. Every trigger now carries `.vzd-item-menu` and is
 * styled once; these invariants are asserted here rather than left to review.
 *
 * The behaviour itself — computed opacity at rest, on hover, on
 * :focus-visible, and under `hover: none` — is verified in a real browser;
 * this test pins the stylesheet facts that make that behaviour possible.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const css = readFileSync(resolve(__dirname, "../styles.css"), "utf8");

/** The declarations of the first rule whose selector list is exactly `selector`. */
function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = css.match(new RegExp(`(^|\\n)${escaped}\\s*\\{([^}]*)\\}`, "m"));
  expect(m, `a rule for ${selector} must exist`).not.toBeNull();
  return m![2];
}

/** The body of the single `@media (hover: none)` block. */
function hoverNoneBlock(): string {
  const start = css.indexOf("@media (hover: none)");
  expect(start, "a @media (hover: none) block must exist").toBeGreaterThan(-1);
  const open = css.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}" && --depth === 0) return css.slice(open, i);
  }
  throw new Error("unterminated @media (hover: none) block");
}

describe("item triggers are styled once", () => {
  it("no canvas restyles its trigger's visibility on its own", () => {
    // A per-canvas `opacity` / `display` rule is how the old drift started.
    for (const cls of [
      "vzd-story-task-delete", "vzd-journey-card-delete", "vzd-scqa-card-del",
      "vzd-flow-card-delete", "vzd-compass-del", "vzd-pc-item-menu", "vzd-card-menu",
    ]) {
      expect(css, `.${cls} must not be styled on its own`).not.toMatch(new RegExp(`\\.${cls}\\b`));
    }
  });
});

describe("item triggers stay reachable on touch", () => {
  it("reveals every trigger under @media (hover: none)", () => {
    const block = hoverNoneBlock();
    expect(block).toContain(".vzd-item-host > .vzd-item-menu");
    expect(block).toMatch(/opacity:\s*1/);
    expect(block).toMatch(/pointer-events:\s*auto/);
  });
});

describe("item triggers stay reachable by keyboard", () => {
  it("hides them with opacity, never display:none, so they stay focusable", () => {
    for (const sel of ["button.vzd-item-menu", ".vzd-item-menu--svg"]) {
      const body = rule(sel);
      expect(body, `${sel} must not use display:none`).not.toMatch(/display:\s*none/);
      expect(body, `${sel} must hide with opacity`).toMatch(/opacity:\s*0/);
      expect(body, `${sel} must not take clicks while hidden`).toMatch(/pointer-events:\s*none/);
    }
  });

  it("reveals the trigger the user has tabbed to, and the one whose item is hovered", () => {
    const body = rule(".vzd-item-host:hover:not(:has(.vzd-item-host:hover)) > .vzd-item-menu,\n.vzd-item-menu:focus-visible");
    expect(body).toMatch(/opacity:\s*1/);
    expect(body).toMatch(/pointer-events:\s*auto/);
  });
});

describe("item triggers meet the minimum target size", () => {
  it("expands the 20px button to a 24px hit area", () => {
    // WCAG 2.2 Target Size (Minimum) is 24x24.
    expect(rule("button.vzd-item-menu")).toMatch(/width:\s*20px/);
    expect(rule("button.vzd-item-menu::after")).toMatch(/inset:\s*-2px/);
  });
});
