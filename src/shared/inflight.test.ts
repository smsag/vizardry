import { describe, it, expect, vi } from "vitest";
import { dedupe, createOnceGate } from "./inflight";

describe("dedupe", () => {
  it("runs the work once for concurrent callers on the same key", async () => {
    // A note mentioning the same ticket ten times must not summarise it ten
    // times — each summary is a billed LLM call.
    const inflight = new Map<string, Promise<string>>();
    const run = vi.fn(async () => "value");

    const results = await Promise.all([
      dedupe(inflight, "K", run),
      dedupe(inflight, "K", run),
      dedupe(inflight, "K", run),
    ]);

    expect(run).toHaveBeenCalledTimes(1);
    expect(results).toEqual(["value", "value", "value"]);
  });

  it("keeps different keys independent", async () => {
    const inflight = new Map<string, Promise<string>>();
    const run = vi.fn(async (): Promise<string> => "v");
    await Promise.all([dedupe(inflight, "A", run), dedupe(inflight, "B", run)]);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("releases the key once the work settles, so a later call re-runs", async () => {
    const inflight = new Map<string, Promise<string>>();
    const run = vi.fn(async () => "v");

    await dedupe(inflight, "K", run);
    expect(inflight.size).toBe(0);
    await dedupe(inflight, "K", run);

    expect(run).toHaveBeenCalledTimes(2);
  });

  it("releases the key after a rejection too", async () => {
    const inflight = new Map<string, Promise<string>>();
    const run = vi.fn(async () => { throw new Error("boom"); });

    await expect(dedupe(inflight, "K", run)).rejects.toThrow("boom");
    expect(inflight.size).toBe(0);
  });

  it("clears only its own slot, leaving a replacement entry intact", async () => {
    // The `finally` cleanup runs after the fact; if it deleted the key
    // unconditionally it would drop whatever took the slot in the meantime.
    const inflight = new Map<string, Promise<string>>();
    let finish: (v: string) => void = () => {};
    const first = dedupe(inflight, "K", () => new Promise<string>((r) => { finish = r; }));

    const replacement = Promise.resolve("replacement");
    inflight.set("K", replacement);

    finish("first");
    await first;

    expect(inflight.get("K")).toBe(replacement);
  });
});

describe("createOnceGate", () => {
  it("fires once, then stays closed until reset", () => {
    const gate = createOnceGate();
    expect(gate.fire()).toBe(true);
    expect(gate.fire()).toBe(false);
    expect(gate.fire()).toBe(false);
    gate.reset();
    expect(gate.fire()).toBe(true);
  });
});
