import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SerialScheduler } from "./preview-scheduler";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("SerialScheduler", () => {
  it("debounces a burst of schedule() calls into one run", async () => {
    const task = vi.fn(() => Promise.resolve());
    const s = new SerialScheduler(task, 250);
    s.schedule();
    s.schedule();
    s.schedule();
    expect(task).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(250);
    await s.idle();
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("runs immediately with now=true", async () => {
    const task = vi.fn(() => Promise.resolve());
    const s = new SerialScheduler(task, 250);
    s.schedule(true);
    await s.idle();
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("never overlaps runs — the next waits for the previous to settle", async () => {
    const order: string[] = [];
    let releaseFirst!: () => void;
    const task = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            order.push("start1");
            releaseFirst = () => {
              order.push("end1");
              resolve();
            };
          }),
      )
      .mockImplementationOnce(() => {
        order.push("start2");
        return Promise.resolve();
      });

    const s = new SerialScheduler(task, 0);
    s.schedule(true); // starts task 1 (pending)
    s.schedule(true); // queued behind task 1
    // Let task 1 begin (a few microtask ticks); it then blocks, pending.
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(order).toEqual(["start1"]); // task 2 hasn't started
    releaseFirst();
    await s.idle();
    expect(order).toEqual(["start1", "end1", "start2"]);
  });

  it("does not start new work after dispose()", async () => {
    const task = vi.fn(() => Promise.resolve());
    const s = new SerialScheduler(task, 100);
    s.schedule();
    s.dispose();
    await vi.advanceTimersByTimeAsync(100);
    await s.idle();
    expect(task).not.toHaveBeenCalled();
  });

  it("ignores a debounced run whose timer fires after dispose()", async () => {
    const task = vi.fn(() => Promise.resolve());
    const s = new SerialScheduler(task, 100);
    s.schedule();
    await vi.advanceTimersByTimeAsync(50);
    s.dispose();
    await vi.advanceTimersByTimeAsync(100);
    await s.idle();
    expect(task).not.toHaveBeenCalled();
  });
});
