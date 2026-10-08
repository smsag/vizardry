// @vitest-environment happy-dom
import "../test-setup";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { activateInlineEdit, activateTextareaEdit, createBlurGuard, wireRenameInputKeys, DEFAULT_BLUR_GUARD_MS } from "./inline-edit";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("activateInlineEdit — blur guard default", () => {
  it("ignores a blur that fires immediately after activation (CM6 focus-steal), by default", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const onCommit = vi.fn();

    activateInlineEdit(host, "Original", onCommit);
    expect(host.hasAttribute("contenteditable")).toBe(true);

    // Simulate CM6 stealing focus back right after .focus() — a spurious
    // blur before the user has touched anything.
    host.dispatchEvent(new FocusEvent("blur"));

    // Still mid-edit: the blur was ignored, not treated as a commit.
    expect(host.classList.contains("vzd-editing")).toBe(true);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("commits normally on blur once the guard window has elapsed", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const onCommit = vi.fn();

    activateInlineEdit(host, "Original", onCommit);
    host.textContent = "Changed";

    vi.advanceTimersByTime(DEFAULT_BLUR_GUARD_MS + 1);
    host.dispatchEvent(new FocusEvent("blur"));

    expect(host.classList.contains("vzd-editing")).toBe(false);
    expect(onCommit).toHaveBeenCalledWith("Changed");
  });

  it("can be disabled per call site via blurGuardMs: 0", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const onCommit = vi.fn();

    activateInlineEdit(host, "Original", onCommit, { blurGuardMs: 0 });
    host.textContent = "Changed";
    host.dispatchEvent(new FocusEvent("blur"));

    expect(onCommit).toHaveBeenCalledWith("Changed");
  });
});

describe("activateInlineEdit — in place", () => {
  function setup(value: string, cls = ""): { host: HTMLElement } {
    const row = document.body.appendChild(document.createElement("div"));
    const host = row.appendChild(document.createElement("span"));
    host.className = cls;
    host.textContent = value;
    return { host };
  }

  it("edits the label itself — no input or textarea is swapped in", () => {
    const { host } = setup("Larger hiring pool");
    activateInlineEdit(host, "Larger hiring pool", vi.fn());
    expect(host.querySelector("input, textarea")).toBeNull();
    expect(host.textContent).toBe("Larger hiring pool");
    expect(host.classList.contains("vzd-inplace-editing")).toBe(true);
  });

  it("commits the trimmed text on Enter and repaints the display", () => {
    const { host } = setup("Old");
    const onCommit = vi.fn();
    activateInlineEdit(host, "Old", onCommit);
    host.textContent = "  New  ";
    host.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(onCommit).toHaveBeenCalledWith("New");
    expect(host.textContent).toBe("New");
    expect(host.hasAttribute("contenteditable")).toBe(false);
  });

  it("reverts on Escape", () => {
    const { host } = setup("Old");
    const onCommit = vi.fn();
    activateInlineEdit(host, "Old", onCommit);
    host.textContent = "New";
    host.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onCommit).not.toHaveBeenCalled();
    expect(host.textContent).toBe("Old");
  });

  it("drops placeholder styling while typing and restores the host's classes after", () => {
    const { host } = setup("Add a question", "vzd-pc-question vzd-pc-question--empty");
    activateInlineEdit(host, "", vi.fn());
    expect(host.textContent).toBe("");
    expect(host.classList.contains("vzd-pc-question--empty")).toBe(false);
    host.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(host.className).toBe("vzd-pc-question vzd-pc-question--empty");
  });

  it("joins pasted line breaks into one line", () => {
    const { host } = setup("Old");
    const onCommit = vi.fn();
    activateInlineEdit(host, "Old", onCommit);
    host.innerHTML = "first<br>second";
    host.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(onCommit).toHaveBeenCalledWith("first second");
  });
});

describe("activateTextareaEdit — in place", () => {
  function start(value: string, opts: Partial<Parameters<typeof activateTextareaEdit>[4]> = {}) {
    const host = document.body.appendChild(document.createElement("div"));
    host.className = "cell cell--empty";
    host.setAttribute("data-placeholder", "Type here");
    const onCommit = vi.fn();
    const renderDisplay = vi.fn((h: HTMLElement, v: string) => { h.textContent = v; });
    activateTextareaEdit(host, host, value, onCommit, { renderDisplay, ...opts });
    return { host, onCommit, renderDisplay };
  }
  const key = (host: HTMLElement, init: KeyboardEventInit): void => {
    host.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
  };

  it("edits the cell itself, multi-line, without placeholder styling", () => {
    const { host } = start("a\nb");
    expect(host.querySelector("textarea")).toBeNull();
    expect(host.textContent).toBe("a\nb");
    expect(host.classList.contains("vzd-inplace-editing--multiline")).toBe(true);
    expect(host.classList.contains("cell--empty")).toBe(false);
    expect(host.hasAttribute("data-placeholder")).toBe(false);
  });

  it("Enter adds a line; Mod+Enter saves", () => {
    const { host, onCommit } = start("a");
    key(host, { key: "Enter" });
    expect(onCommit).not.toHaveBeenCalled();
    host.textContent = "a\nb";
    key(host, { key: "Enter", metaKey: true });
    expect(onCommit).toHaveBeenCalledWith("a\nb");
    expect(host.classList.contains("vzd-editing")).toBe(false);
    expect(host.className).toBe("cell cell--empty");
  });

  it("Tab saves by default", () => {
    const { host, onCommit } = start("a");
    host.textContent = "b";
    key(host, { key: "Tab" });
    expect(onCommit).toHaveBeenCalledWith("b");
  });

  it("Tab indents instead when asked, keeping the editor open", () => {
    const { host, onCommit } = start("a", { onTab: "indent" });
    const ev = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    host.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(host.textContent).toContain("  ");
    expect(onCommit).not.toHaveBeenCalled();
    expect(host.hasAttribute("contenteditable")).toBe(true);
  });

  it("Escape reverts to the current value", () => {
    const { host, onCommit, renderDisplay } = start("a");
    host.textContent = "b";
    key(host, { key: "Escape" });
    expect(onCommit).not.toHaveBeenCalled();
    expect(renderDisplay).toHaveBeenLastCalledWith(host, "a");
  });
});

describe("createBlurGuard", () => {
  it("ignores blur while guarded, then stops after the window elapses", () => {
    const guard = createBlurGuard(150);
    const input = document.createElement("input");
    document.body.appendChild(input);
    const onFinish = vi.fn();

    wireRenameInputKeys(input, onFinish, { ignoreBlur: guard.ignoreBlur });

    input.dispatchEvent(new FocusEvent("blur"));
    expect(onFinish).not.toHaveBeenCalled();

    vi.advanceTimersByTime(151);
    input.dispatchEvent(new FocusEvent("blur"));
    expect(onFinish).toHaveBeenCalledWith(true);
  });

  it("dispose() cancels the pending timer without throwing, for cleanup on early finish", () => {
    const guard = createBlurGuard(150);
    expect(() => guard.dispose()).not.toThrow();
    // Calling dispose() twice (e.g. once from finish(), once from a caller's
    // own cleanup) must also be safe.
    expect(() => guard.dispose()).not.toThrow();
  });
});
