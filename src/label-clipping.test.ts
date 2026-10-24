/**
 * Guards that a canvas never cuts a label off, at the stylesheet level.
 *
 * A clipped label loses words the canvas shows nowhere else. Venn region
 * labels used to end in "…" once they outgrew their narrow region, and the
 * strategy canvas centred its last factor label on a point near the right
 * edge, so half of it hung over the side. Where each label goes is tested
 * with its renderer; this pins the stylesheet facts that keep it whole.
 */
import { describe, it, expect } from "vitest";
import { rule } from "./test-styles";

describe("canvas labels are never cut off", () => {
  it("a Venn region label wraps instead of ending in an ellipsis", () => {
    const body = rule(".vzd-venn-item");
    expect(body).not.toMatch(/text-overflow:\s*ellipsis/);
    expect(body).not.toMatch(/white-space:\s*nowrap/);
  });

  it("a strategy canvas factor label sits where its renderer puts it", () => {
    // The renderer gives each label a box that stays inside the canvas; a
    // transform would shift that box half its width again.
    expect(rule(".vzd-strategy-factor")).not.toMatch(/transform:/);
  });
});
