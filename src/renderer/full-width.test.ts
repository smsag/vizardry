// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { applyFullWidth } from "./full-width";

function canvasIn(parent: HTMLElement): HTMLElement {
  const el = document.createElement("div");
  el.className = "vizardry-canvas";
  parent.appendChild(el);
  return el;
}

function workspaceView(width: number): HTMLElement {
  const leaf = document.createElement("div");
  leaf.className = "workspace-leaf-content";
  const view = document.createElement("div");
  view.className = "view-content";
  Object.defineProperty(view, "clientWidth", { configurable: true, value: width });
  leaf.appendChild(view);
  document.body.appendChild(leaf);
  return view;
}

afterEach(() => {
  document.body.innerHTML = "";
  document.body.className = "";
});

describe("applyFullWidth", () => {
  it("breaks a canvas out of the reading column inside a workspace view", () => {
    document.body.classList.add("is-readable-line-width");
    const canvas = canvasIn(workspaceView(1000));

    applyFullWidth(canvas);

    expect(canvas.style.width).toBe("968px");
    expect(canvas.style.transform).toBe("translateX(-50%)");
  });

  it("fills another plugin's render host rather than sizing to the window", () => {
    // A note printed to PDF is rendered off-screen into a host of the printer's
    // choosing. Sized to the window, its picture's scale followed the window.
    document.body.classList.add("is-readable-line-width");
    const host = document.createElement("div");
    document.body.appendChild(host);
    const canvas = canvasIn(host);

    applyFullWidth(canvas);

    expect(canvas.style.width).toBe("100%");
    expect(canvas.style.maxWidth).toBe("100%");
    expect(canvas.style.transform).toBe("");
    expect(canvas.style.left).toBe("");
  });
});
