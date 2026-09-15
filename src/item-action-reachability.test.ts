/**
 * Guards the reachability contract for every delete/unlink control, at the
 * stylesheet level.
 *
 * These controls were hidden with `display: none` until their parent was
 * hovered, which made them impossible to reach on touch (no hover exists) and
 * impossible to reach by keyboard on any platform (`display: none` drops an
 * element from the tab order). Both are easy to reintroduce by copying an
 * older block, so the invariants are asserted here rather than left to review.
 *
 * The behaviour itself — computed opacity at rest, on hover, on
 * :focus-visible, and under `hover: none` — is verified in a real browser;
 * this test pins the stylesheet facts that make that behaviour possible.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const css = readFileSync(resolve(__dirname, "../styles.css"), "utf8");

/** Controls that destroy note content, plus the ones that only unlink. */
const HTML_CONTROLS = [
  "vzd-story-task-delete",
  "vzd-journey-card-delete",
  "vzd-scqa-card-del",
  "vzd-flow-card-delete",
  "vzd-compass-del",
];

const SVG_CONTROLS = [
  "vzd-tree-edit-del",
  "vzd-wardley-unlink-btn",
  "vzd-nodemap-box-delete-btn",
];

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

/** The declarations of the first rule whose selector is exactly `.<cls>`. */
function baseRule(cls: string): string {
  const re = new RegExp(`(^|\\n)\\.${cls}\\s*\\{([^}]*)\\}`, "m");
  const m = css.match(re);
  expect(m, `a base rule for .${cls} must exist`).not.toBeNull();
  return m![2];
}

describe("delete controls stay reachable on touch", () => {
  it("reveals every control under @media (hover: none)", () => {
    // Without this, deleting a card is impossible on a phone or tablet —
    // which is exactly what shipped before 0.67.
    const block = hoverNoneBlock();
    for (const cls of [...HTML_CONTROLS, ...SVG_CONTROLS]) {
      expect(block, `${cls} must be revealed on touch`).toContain(`.${cls}`);
    }
    expect(block).toMatch(/opacity:\s*1/);
    expect(block).toMatch(/pointer-events:\s*auto/);
  });
});

describe("delete controls stay reachable by keyboard", () => {
  it("never hides an HTML control with display:none", () => {
    // display:none removes the element from the tab order entirely.
    for (const cls of HTML_CONTROLS) {
      expect(baseRule(cls), `.${cls} must not use display:none`).not.toMatch(/display:\s*none/);
    }
  });

  it("hides them with opacity instead, so they stay focusable", () => {
    for (const cls of HTML_CONTROLS) {
      expect(css, `.${cls} must be hidden with opacity`)
        .toMatch(new RegExp(`\\.${cls}[^{]*\\{[^}]*opacity:\\s*0`, "s"));
    }
  });

  it("reveals the control the user has tabbed to", () => {
    for (const cls of HTML_CONTROLS) {
      expect(css, `.${cls} needs a :focus-visible reveal`).toContain(`.${cls}:focus-visible`);
    }
  });
});

describe("delete controls meet the minimum target size", () => {
  it("expands each 16px badge to a 24px hit area", () => {
    // WCAG 2.2 Target Size (Minimum) is 24x24. The badge stays 16px so six
    // canvases keep their look; an invisible inset carries the target.
    for (const cls of HTML_CONTROLS) {
      expect(css, `.${cls} needs an expanded hit area`).toContain(`.${cls}::after`);
    }
    const m = css.match(/\.vzd-story-task-delete::after[\s\S]*?\{([\s\S]*?)\}/);
    expect(m![1]).toMatch(/inset:\s*-4px/); // 16 + 2*4 = 24
  });
});
