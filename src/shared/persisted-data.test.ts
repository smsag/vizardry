import { describe, it, expect, vi } from "vitest";
import { updatePersistedData } from "./persisted-data";

function fakeStore(initial: Record<string, unknown> = {}) {
  let data: Record<string, unknown> = { ...initial };
  const store = {
    loadData: vi.fn(async () => ({ ...data })),
    saveData: vi.fn(async (next: Record<string, unknown>) => { data = { ...next }; }),
  };
  return { store, getData: () => data };
}

describe("updatePersistedData", () => {
  it("applies a single update", async () => {
    const { store, getData } = fakeStore();
    await updatePersistedData(store, (existing) => { existing.a = 1; });
    expect(getData()).toEqual({ a: 1 });
  });

  it("serializes concurrent updates so neither clobbers the other", async () => {
    // Reproduces the exact race this fixes: call A's loadData() is still
    // in flight when call B starts (and finishes) its whole read-modify-write
    // cycle. Without queuing, A's later saveData() would overwrite B's key
    // with a snapshot taken before B ever wrote.
    const { store, getData } = fakeStore();
    let resolveA: () => void = () => {};
    const aGate = new Promise<void>((r) => { resolveA = r; });
    store.loadData.mockImplementationOnce(async () => {
      await aGate;
      return { ...getData() };
    });

    const a = updatePersistedData(store, (existing) => { existing.a = 1; });
    const b = updatePersistedData(store, (existing) => { existing.b = 2; });

    resolveA();
    await Promise.all([a, b]);

    expect(getData()).toEqual({ a: 1, b: 2 });
  });

  it("each queued update's loadData sees all earlier updates already applied", async () => {
    const { store, getData } = fakeStore();
    await Promise.all([
      updatePersistedData(store, (existing) => { existing.count = ((existing.count as number) ?? 0) + 1; }),
      updatePersistedData(store, (existing) => { existing.count = ((existing.count as number) ?? 0) + 1; }),
      updatePersistedData(store, (existing) => { existing.count = ((existing.count as number) ?? 0) + 1; }),
    ]);
    expect(getData()).toEqual({ count: 3 });
  });

  it("an earlier update throwing doesn't block later queued updates", async () => {
    const { store, getData } = fakeStore();
    const failing = updatePersistedData(store, () => { throw new Error("boom"); });
    const ok = updatePersistedData(store, (existing) => { existing.ok = true; });

    await expect(failing).rejects.toThrow("boom");
    await ok;
    expect(getData()).toEqual({ ok: true });
  });

  it("keeps queues independent per plugin instance", async () => {
    const { store: storeA, getData: getA } = fakeStore();
    const { store: storeB, getData: getB } = fakeStore();
    await Promise.all([
      updatePersistedData(storeA, (e) => { e.x = "A"; }),
      updatePersistedData(storeB, (e) => { e.x = "B"; }),
    ]);
    expect(getA()).toEqual({ x: "A" });
    expect(getB()).toEqual({ x: "B" });
  });

  it("defaults to an empty object when loadData returns null/undefined", async () => {
    const store = { loadData: vi.fn(async () => undefined), saveData: vi.fn(async () => {}) };
    await updatePersistedData(store, (existing) => { existing.a = 1; });
    expect(store.saveData).toHaveBeenCalledWith({ a: 1 });
  });
});
