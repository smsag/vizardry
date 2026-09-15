import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { UndoWindow, UNDO_WINDOW_MS } from "./undo";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("UndoWindow", () => {
  it("is closed until something is removed", () => {
    expect(new UndoWindow<string>(vi.fn()).pending()).toBe(0);
  });

  it("holds a removal for exactly ten seconds", () => {
    const w = new UndoWindow<string>(vi.fn());
    w.offer(["a"], vi.fn());
    vi.advanceTimersByTime(UNDO_WINDOW_MS - 1);
    expect(w.pending()).toBe(1);
    vi.advanceTimersByTime(1);
    expect(w.pending()).toBe(0);
  });

  it("restores in the order it was given", () => {
    const restore = vi.fn();
    const w = new UndoWindow<string>(vi.fn());
    w.offer(["a", "b"], restore);
    w.undo();
    expect(restore).toHaveBeenCalledWith(["a", "b"]);
    expect(w.pending()).toBe(0);
  });

  it("merges a second removal into the open window", () => {
    // "Clear all" then one more close should offer a single Undo, not a queue
    // the user has to work through backwards.
    const restore = vi.fn();
    const w = new UndoWindow<string>(vi.fn());
    w.offer(["a"], restore);
    vi.advanceTimersByTime(3000);
    w.offer(["b"], restore);
    expect(w.pending()).toBe(2);
    w.undo();
    expect(restore).toHaveBeenCalledWith(["a", "b"]);
  });

  it("restarts the ten seconds on each removal", () => {
    const w = new UndoWindow<string>(vi.fn());
    w.offer(["a"], vi.fn());
    vi.advanceTimersByTime(9000);
    w.offer(["b"], vi.fn());
    vi.advanceTimersByTime(9000);
    expect(w.pending()).toBe(2);
    vi.advanceTimersByTime(1001);
    expect(w.pending()).toBe(0);
  });

  it("restores nothing once the window has closed", () => {
    const restore = vi.fn();
    const w = new UndoWindow<string>(vi.fn());
    w.offer(["a"], restore);
    vi.advanceTimersByTime(UNDO_WINDOW_MS + 1);
    w.undo();
    expect(restore).not.toHaveBeenCalled();
  });

  it("discards without restoring", () => {
    const restore = vi.fn();
    const w = new UndoWindow<string>(vi.fn());
    w.offer(["a"], restore);
    w.discard();
    expect(w.pending()).toBe(0);
    expect(restore).not.toHaveBeenCalled();
  });

  it("ignores an empty removal", () => {
    const onChange = vi.fn();
    const w = new UndoWindow<string>(onChange);
    w.offer([], vi.fn());
    expect(w.pending()).toBe(0);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("reports every state change so the bar can follow it", () => {
    const onChange = vi.fn();
    const w = new UndoWindow<string>(onChange);
    w.offer(["a"], vi.fn());          // appears
    expect(onChange).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(UNDO_WINDOW_MS + 1); // expires
    expect(onChange).toHaveBeenCalledTimes(2);
  });
});
