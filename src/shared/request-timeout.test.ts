import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { withTimeout } from "./request-timeout";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("withTimeout", () => {
  it("resolves with the original value when the promise settles before the timeout", async () => {
    const p = withTimeout(Promise.resolve("ok"), 1000, "Test");
    await expect(p).resolves.toBe("ok");
  });

  it("rejects with the original error when the promise rejects before the timeout", async () => {
    const p = withTimeout(Promise.reject(new Error("boom")), 1000, "Test");
    await expect(p).rejects.toThrow("boom");
  });

  it("rejects with a timeout error once the deadline elapses without settling", async () => {
    let neverSettles!: (v: unknown) => void;
    const stuck = new Promise((resolve) => { neverSettles = resolve; });
    const p = withTimeout(stuck, 5000, "Test");

    const assertion = expect(p).rejects.toThrow("Test — timed out after 5000ms");
    await vi.advanceTimersByTimeAsync(5000);
    await assertion;
    neverSettles(undefined); // avoid an unhandled-settle warning after the test
  });

  it("does not fire the timeout once the promise has already resolved", async () => {
    const p = withTimeout(Promise.resolve("fast"), 5000, "Test");
    await expect(p).resolves.toBe("fast");
    // Advancing time after resolution must not throw/reject unexpectedly.
    await vi.advanceTimersByTimeAsync(10_000);
  });
});
