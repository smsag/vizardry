// @vitest-environment happy-dom
import "../test-setup";
import { describe, it, expect } from "vitest";
import { renderInline, stripInline, parseInline } from "./inline-markdown";

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

  it("appends to existing content", () => {
    const el = document.createElement("div");
    el.textContent = "x ";
    renderInline(el as unknown as HTMLElement, "==y==");
    expect(el.innerHTML).toBe('x <mark class="vzd-mark">y</mark>');
  });

  it("never interprets HTML in labels", () => {
    expect(render("<b>==x==</b>").innerHTML).toBe('&lt;b&gt;<mark class="vzd-mark">x</mark>&lt;/b&gt;');
  });
});

describe("renderInline — ==highlight==", () => {
  it("renders a plain highlight without a colour attribute", () => {
    expect(render("a ==key== point").innerHTML).toBe('a <mark class="vzd-mark">key</mark> point');
  });

  it.each([
    ["🔴", "red"],
    ["🟠", "orange"],
    ["🟡", "yellow"],
    ["🟢", "green"],
    ["🔵", "blue"],
    ["🟣", "purple"],
  ])("reads %s as the %s highlight and hides the emoji", (emoji, color) => {
    expect(render(`==${emoji}risk==`).innerHTML).toBe(`<mark class="vzd-mark" data-highlight="${color}">risk</mark>`);
  });

  it("consumes a variation selector after the colour emoji", () => {
    expect(render("==🔴\uFE0Frisk==").innerHTML).toBe('<mark class="vzd-mark" data-highlight="red">risk</mark>');
  });

  it("treats any other leading emoji as content", () => {
    expect(render("==🚀launch==").innerHTML).toBe('<mark class="vzd-mark">🚀launch</mark>');
  });

  it("treats a colour emoji later in the text as content", () => {
    expect(render("==a 🔴 b==").innerHTML).toBe('<mark class="vzd-mark">a 🔴 b</mark>');
  });

  it("nests formatting inside a highlight", () => {
    expect(render("==a **b** *c* ~~d~~==").innerHTML)
      .toBe('<mark class="vzd-mark">a <strong>b</strong> <em>c</em> <s>d</s></mark>');
  });

  it("nests a highlight inside bold", () => {
    expect(render("**==x==**").innerHTML).toBe('<strong><mark class="vzd-mark">x</mark></strong>');
  });

  it("nests a coloured highlight inside italic", () => {
    expect(render("*==🟢ok==*").innerHTML).toBe('<em><mark class="vzd-mark" data-highlight="green">ok</mark></em>');
  });

  it("renders several highlights in one label", () => {
    expect(render("==a== and ==🔵b==").innerHTML)
      .toBe('<mark class="vzd-mark">a</mark> and <mark class="vzd-mark" data-highlight="blue">b</mark>');
  });

  it.each([
    ["an unclosed opener", "==open"],
    ["an empty highlight", "===="],
    ["a highlight holding only a colour", "==🔴=="],
    ["whitespace after the opener", "== x =="],
    ["whitespace before the closer", "==x =="],
    ["a lone marker", "a == b"],
    ["comparison operators", "if a == b and c == d"],
  ])("leaves %s literal", (_label, text) => {
    expect(render(text).innerHTML).toBe(text);
  });

  it("does not let formats cross: the earlier opener wins", () => {
    // Obsidian's reading: `a **b` is highlighted, the stray ** stays literal.
    expect(render("==a **b== c**").innerHTML).toBe('<mark class="vzd-mark">a **b</mark> c**');
  });

  it("keeps an escaped marker literal", () => {
    expect(render("\\==x\\==").innerHTML).toBe("==x==");
    expect(render("\\*\\*x\\*\\*").innerHTML).toBe("**x**");
  });

  it("keeps a backslash that escapes nothing", () => {
    expect(render("C:\\path").innerHTML).toBe("C:\\path");
  });
});

describe("renderInline — emphasis edge cases", () => {
  it("does not italicise underscores inside a word", () => {
    expect(render("snake_case_name").innerHTML).toBe("snake_case_name");
  });

  it("does not italicise a spaced asterisk", () => {
    expect(render("2 * 3 * 4").innerHTML).toBe("2 * 3 * 4");
  });

  it("nests bold inside bold-italic text", () => {
    expect(render("*a **b** c*").innerHTML).toBe("<em>a <strong>b</strong> c</em>");
  });

  it("renders ***both*** as bold italic", () => {
    expect(render("***x***").innerHTML).toBe("<em><strong>x</strong></em>");
  });

  it("closes an inner and an outer format in one marker run", () => {
    expect(render("**bold *italic***").innerHTML).toBe("<strong>bold <em>italic</em></strong>");
  });

  it("renders __bold__", () => {
    expect(render("__bold__").innerHTML).toBe("<strong>bold</strong>");
  });

  it("leaves glob patterns alone", () => {
    expect(render("*.md *.ts *.css").innerHTML).toBe("*.md *.ts *.css");
  });

  it.each([
    ["unmatched openers", "*a ".repeat(1600)],
    ["unmatched underscores", "_a ".repeat(1600)],
    ["unmatched highlights", "==a ".repeat(1200)],
    ["nested unmatched openers", "*a **b ==c ~~d ".repeat(300)],
  ])("stays linear on %s", (_label, text) => {
    const t0 = performance.now();
    render(text);
    expect(performance.now() - t0).toBeLessThan(200);
  });

  it("stays fast on unmatched marker soup", () => {
    const soup = "*_~~==**".repeat(300);
    const t0 = performance.now();
    render(soup);
    expect(performance.now() - t0).toBeLessThan(500);
  });
});

describe("stripInline", () => {
  it.each([
    ["plain", "plain"],
    ["==Goal==", "Goal"],
    ["==🔴Goal==", "Goal"],
    ["**==Goal==** now", "Goal now"],
    ["a *b* _c_ ~~d~~", "a b c d"],
    ["\\==x\\==", "==x=="],
    ["== x ==", "== x =="],
    ["snake_case", "snake_case"],
    ["", ""],
  ])("%j → %j", (input, expected) => {
    expect(stripInline(input)).toBe(expected);
  });
});

describe("parseInline", () => {
  it("returns the colour on the mark node", () => {
    expect(parseInline("==🟣x==")).toEqual([
      { kind: "mark", color: "purple", children: [{ kind: "text", text: "x" }] },
    ]);
  });
});
