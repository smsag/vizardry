// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { appendSanitizedHtml } from "./sanitize";

function run(html: string): string {
  const host = document.createElement("div");
  appendSanitizedHtml(host, html);
  return host.innerHTML;
}

describe("appendSanitizedHtml", () => {
  it("keeps ordinary prose markup", () => {
    expect(run("<p>Hello <strong>bold</strong> <em>it</em> <code>x</code></p>"))
      .toBe("<p>Hello <strong>bold</strong> <em>it</em> <code>x</code></p>");
  });

  it("drops script and style elements with their contents", () => {
    expect(run("<p>a</p><script>alert(1)</script><style>p{}</style>")).toBe("<p>a</p>");
  });

  it("strips event-handler attributes", () => {
    expect(run('<img src="https://x/y.png" onerror="alert(1)" alt="a">'))
      .toBe('<img src="https://x/y.png" alt="a">');
  });

  it("removes javascript: and data: URLs, including obfuscated schemes", () => {
    expect(run('<a href="javascript:alert(1)">x</a>')).toBe("<a>x</a>");
    expect(run('<a href="java&#9;script:alert(1)">x</a>')).toBe("<a>x</a>");
    expect(run('<img src="data:text/html,foo">')).toBe("<img>");
  });

  it("keeps http links and opens them safely in a new tab", () => {
    expect(run('<a href="https://example.com">x</a>'))
      .toBe('<a href="https://example.com" rel="noopener noreferrer" target="_blank">x</a>');
  });

  it("unwraps unknown elements but keeps their text", () => {
    expect(run("<font color=red>hi <b>there</b></font>")).toBe("hi <b>there</b>");
    expect(run("<svg onload=alert(1)><text>t</text></svg>")).toBe("t");
  });

  it("drops iframes, forms and comments", () => {
    expect(run('<iframe src="https://evil"></iframe><form><input name=x></form><!-- c -->x'))
      .toBe("x");
  });

  it("keeps task-list checkboxes as inert markers only", () => {
    expect(run('<li><input type="checkbox" checked> done</li>'))
      .toBe('<li><input type="checkbox" checked="" disabled=""> done</li>');
    expect(run('<input type="text" value="x">')).toBe("");
  });

  it("keeps table structure and span attributes, drops inline styles", () => {
    expect(run('<table><tr><th colspan="2" style="color:red">h</th></tr></table>'))
      .toContain('<th colspan="2">h</th>');
  });
});
