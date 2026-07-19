import { describe, it, expect } from "vitest";
import { parseNodeMap } from "./nodemap";

describe("parseNodeMap", () => {
  // ── Happy paths ────────────────────────────────────────────────────────────

  it("parses a single box", () => {
    const result = parseNodeMap("box: Customer [x: 10, y: 20]");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.boxes).toEqual([{ name: "Customer", x: 10, y: 20, color: undefined, body: undefined }]);
  });

  it("parses a box with a named color", () => {
    const result = parseNodeMap("box: Customer [x: 10, y: 20, color: blue]");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.boxes[0].color).toBe("blue");
  });

  it("parses a box with a hex color", () => {
    const result = parseNodeMap("box: Customer [x: 10, y: 20, color: #ff00aa]");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.boxes[0].color).toBe("#ff00aa");
  });

  it("parses a box with multi-line body text", () => {
    const src = [
      "box: Order Service [x: 10, y: 20]",
      "  Handles order creation",
      "  and validation",
      "box: Other [x: 100, y: 20]",
    ].join("\n");
    const result = parseNodeMap(src);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.boxes[0].body).toBe("Handles order creation\nand validation");
    expect(result.data.boxes[1].body).toBeUndefined();
  });

  it("ends a box body at a blank line", () => {
    const src = [
      "box: A [x: 0, y: 0]",
      "  line one",
      "",
      "box: B [x: 10, y: 10]",
    ].join("\n");
    const result = parseNodeMap(src);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.boxes[0].body).toBe("line one");
  });

  it("parses a directed link", () => {
    const result = parseNodeMap("box: A [x: 0, y: 0]\nbox: B [x: 10, y: 10]\nlink: A -> B");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.links).toEqual([{ from: "A", to: "B", direction: "directed", label: undefined, color: undefined, style: "solid" }]);
  });

  it("parses a bidirectional link", () => {
    const result = parseNodeMap("box: A [x: 0, y: 0]\nbox: B [x: 10, y: 10]\nlink: A <-> B");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.links[0].direction).toBe("bidirectional");
  });

  it("parses an undirected link", () => {
    const result = parseNodeMap("box: A [x: 0, y: 0]\nbox: B [x: 10, y: 10]\nlink: A -- B");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.links[0].direction).toBe("undirected");
  });

  it("parses a link with a label", () => {
    const result = parseNodeMap("box: A [x: 0, y: 0]\nbox: B [x: 10, y: 10]\nlink: A -> B : places order");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.links[0].label).toBe("places order");
  });

  it("parses a link with color and style modifiers", () => {
    const result = parseNodeMap("box: A [x: 0, y: 0]\nbox: B [x: 10, y: 10]\nlink: A -> B [color: red, style: dashed]");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.links[0].color).toBe("red");
    expect(result.data.links[0].style).toBe("dashed");
  });

  it("parses a link with a label and modifiers together", () => {
    const result = parseNodeMap("box: A [x: 0, y: 0]\nbox: B [x: 10, y: 10]\nlink: A -> B : ratio 1:1 [color: green]");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.links[0].label).toBe("ratio 1:1");
    expect(result.data.links[0].color).toBe("green");
  });

  it("normalises link endpoints to the box's declared casing", () => {
    const result = parseNodeMap("box: Customer [x: 0, y: 0]\nbox: Order [x: 10, y: 10]\nlink: customer -> ORDER");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.links[0]).toMatchObject({ from: "Customer", to: "Order" });
  });

  it("ignores blank lines, comments, and title", () => {
    const result = parseNodeMap("title: My Map\n// a comment\n\nbox: A [x: 0, y: 0]");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.boxes).toHaveLength(1);
  });

  // ── Error paths ────────────────────────────────────────────────────────────

  it("returns error for no boxes", () => {
    const result = parseNodeMap("");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/no boxes/i);
  });

  it("returns error for a box missing coordinates", () => {
    const result = parseNodeMap("box: A");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/coordinates/i);
  });

  it("returns error for negative coordinates", () => {
    const result = parseNodeMap("box: A [x: -5, y: 10]");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/non-negative/i);
  });

  it("returns error for a duplicate box name", () => {
    const result = parseNodeMap("box: A [x: 0, y: 0]\nbox: A [x: 10, y: 10]");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/duplicate/i);
  });

  it("returns error for a box name containing a colon", () => {
    const result = parseNodeMap("box: A: B [x: 0, y: 0]");
    expect(result.ok).toBe(false);
  });

  it("returns error for an invalid box color", () => {
    const result = parseNodeMap("box: A [x: 0, y: 0, color: notacolor]");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/unrecognised color/i);
  });

  it("returns error for a self-link", () => {
    const result = parseNodeMap("box: A [x: 0, y: 0]\nlink: A -> A");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/self-link/i);
  });

  it("returns error for a link to an undeclared box", () => {
    const result = parseNodeMap("box: A [x: 0, y: 0]\nlink: A -> B");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/unknown box/i);
  });

  it("returns error for a link missing a separator", () => {
    const result = parseNodeMap("box: A [x: 0, y: 0]\nbox: B [x: 10, y: 10]\nlink: A B");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/requires/i);
  });

  it("returns error for an invalid link style", () => {
    const result = parseNodeMap("box: A [x: 0, y: 0]\nbox: B [x: 10, y: 10]\nlink: A -> B [style: squiggly]");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/style must be/i);
  });

  it("returns error for an unrecognised line", () => {
    const result = parseNodeMap("box: A [x: 0, y: 0]\nthis is garbage");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/line 2/i);
  });

  it("returns error when box count exceeds the limit", () => {
    const src = Array.from({ length: 51 }, (_, i) => `box: B${i} [x: ${i}, y: 0]`).join("\n");
    const result = parseNodeMap(src);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/limit is 50/i);
  });
});
