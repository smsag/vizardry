// @vitest-environment happy-dom
import "../test-setup";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { activateInlineEdit, createBlurGuard, wireRenameInputKeys, DEFAULT_BLUR_GUARD_MS } from "./inline-edit";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("activateInlineEdit — blur guard default", () => {
  it("ignores a blur that fires immediately after activation (CM6 focus-steal), by default", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const onCommit = vi.fn();

    activateInlineEdit(host, "Original", onCommit);
    const input = host.querySelector("input")!;
    expect(input).toBeTruthy();

    // Simulate CM6 stealing focus back right after .focus() — a spurious
    // blur before the user has touched anything.
    input.dispatchEvent(new FocusEvent("blur"));

    // Still mid-edit: the blur was ignored, not treated as a commit.
    expect(host.classList.contains("vzd-editing")).toBe(true);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("commits normally on blur once the guard window has elapsed", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const onCommit = vi.fn();

    activateInlineEdit(host, "Original", onCommit);
    const input = host.querySelector("input")!;
    input.value = "Changed";

    vi.advanceTimersByTime(DEFAULT_BLUR_GUARD_MS + 1);
    input.dispatchEvent(new FocusEvent("blur"));

    expect(host.classList.contains("vzd-editing")).toBe(false);
    expect(onCommit).toHaveBeenCalledWith("Changed");
  });

  it("can be disabled per call site via blurGuardMs: 0", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const onCommit = vi.fn();

    activateInlineEdit(host, "Original", onCommit, { blurGuardMs: 0 });
    const input = host.querySelector("input")!;
    input.value = "Changed";
    input.dispatchEvent(new FocusEvent("blur"));

    expect(onCommit).toHaveBeenCalledWith("Changed");
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
