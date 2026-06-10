// @vitest-environment happy-dom
import "../test-setup";
import { describe, it, expect } from "vitest";
import { renderInline } from "./inline-markdown";

function render(text: string): HTMLElement {
  const el = document.createElement("div");
  renderInline(el as unknown as HTMLElement, text);
  return el;
}

describe("renderInline", () => {
  it("renders plain text unchanged", () => {
    expect(render("hello world").innerHTML).toBe("hello world");
  });

  it("renders **bold**", () => {
    expect(render("a **bold** word").innerHTML).toBe("a <strong>bold</strong> word");
  });

  it("renders *italic*", () => {
    expect(render("an *italic* word").innerHTML).toBe("an <em>italic</em> word");
  });

  it("renders _italic_", () => {
    expect(render("an _italic_ word").innerHTML).toBe("an <em>italic</em> word");
  });

  it("renders ~~strikethrough~~", () => {
    expect(render("a ~~struck~~ word").innerHTML).toBe("a <s>struck</s> word");
  });

  it("renders mixed formats", () => {
    const el = render("**bold** and *italic* and ~~strike~~");
    expect(el.querySelector("strong")?.textContent).toBe("bold");
    expect(el.querySelector("em")?.textContent).toBe("italic");
    expect(el.querySelector("s")?.textContent).toBe("strike");
  });

  it("leaves unmatched markers as plain text", () => {
    expect(render("no ** match here").innerHTML).toBe("no ** match here");
  });

  it("renders text with no markers", () => {
    expect(render("").innerHTML).toBe("");
  });
});
