import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { withRetry429 } from "./request-retry";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("withRetry429", () => {
  it("returns immediately on a non-429 response, without retrying", async () => {
    const fn = vi.fn().mockResolvedValue({ status: 200 });
    const result = await withRetry429(fn);
    expect(result).toEqual({ status: 200 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does not retry a 401 or other non-429 error status", async () => {
    const fn = vi.fn().mockResolvedValue({ status: 401 });
    const result = await withRetry429(fn);
    expect(result).toEqual({ status: 401 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on 429 with exponential backoff, then returns the eventual success", async () => {
    const fn = vi.fn()
      .mockResolvedValueOnce({ status: 429 })
      .mockResolvedValueOnce({ status: 429 })
      .mockResolvedValueOnce({ status: 200 });

    const promise = withRetry429(fn, { maxRetries: 2, baseDelayMs: 100 });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toEqual({ status: 200 });
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("gives up and returns the 429 response after maxRetries is exhausted", async () => {
    const fn = vi.fn().mockResolvedValue({ status: 429 });

    const promise = withRetry429(fn, { maxRetries: 2, baseDelayMs: 10 });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toEqual({ status: 429 });
    expect(fn).toHaveBeenCalledTimes(3); // initial attempt + 2 retries
  });

  it("propagates a thrown error immediately, without retrying", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("network down"));
    await expect(withRetry429(fn)).rejects.toThrow("network down");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("honours an integer Retry-After header instead of the default backoff", async () => {
    const fn = vi.fn()
      .mockResolvedValueOnce({ status: 429, headers: { "retry-after": "2" } })
      .mockResolvedValueOnce({ status: 200 });

    const promise = withRetry429(fn, { baseDelayMs: 10_000 }); // would be much slower without Retry-After
    await vi.advanceTimersByTimeAsync(2000);
    const result = await promise;

    expect(result).toEqual({ status: 200 });
  });
});
