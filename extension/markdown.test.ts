// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";

const { dispatch } = vi.hoisted(() => ({ dispatch: vi.fn() }));
vi.mock("../src/vizardry-dispatch", () => ({ dispatchVizardry: dispatch }));

import "../src/shared/obsidian-dom-polyfill";
import { renderDocument } from "./markdown";

function render(md: string): HTMLElement {
  const host = document.createElement("div");
  renderDocument(md, host, {} as any, {} as any);
  return host;
}

describe("renderDocument", () => {
  it("drops leading YAML frontmatter, CRLF included", () => {
    expect(render("---\ntitle: x\n---\nHello").querySelector("hr, h2")).toBeNull();
    expect(render("---\r\ntitle: x\r\n---\r\nHello").querySelector("hr, h2")).toBeNull();
  });

  it("treats a fence with extra info-string words as vizardry", () => {
    dispatch.mockClear();
    render("```vizardry foo\ntype: swot\n```");
    expect(dispatch).toHaveBeenCalledTimes(1);
  });
});
