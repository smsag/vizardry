import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("obsidian", () => ({ Notice: class Notice { constructor(_msg: string) {} } }));
vi.mock("../shared/keychain", () => ({ loadSecret: vi.fn().mockResolvedValue("api-key") }));
vi.mock("./client", () => ({ fetchLinearIssue: vi.fn() }));

import { fetchLinearIssue } from "./client";
import { initLinearService, getLinearService } from "./index";

const mockedFetch = vi.mocked(fetchLinearIssue);

function fakePlugin(overrides: Partial<{ linearEnabled: boolean }> = {}) {
  return {
    app: {},
    settings: {
      linearEnabled: true,
      linearSecretName: "key",
      llmSecretName: "llm-key",
      statusTtlMinutes: 5,
      linearBaseUrl: "https://api.linear.app/graphql",
      ...overrides,
    },
    loadData: vi.fn().mockResolvedValue({}),
    saveData: vi.fn().mockResolvedValue(undefined),
  } as any;
}

function makeIssue(overrides: Record<string, unknown> = {}) {
  return {
    key: "ENG-1",
    title: "T",
    description: "",
    state: { name: "In Progress", color: "#4ea7fc", type: "started" },
    assignee: null,
    comments: [],
    updatedAt: "2026-01-01T00:00:00Z",
    url: "",
    ...overrides,
  };
}

beforeEach(() => mockedFetch.mockReset());

describe("LinearService.getStatus", () => {
  it("creates a blank summary entry for a never-before-seen issue", async () => {
    mockedFetch.mockResolvedValue(makeIssue() as any);
    initLinearService(fakePlugin());
    const svc = getLinearService()!;

    const state = await svc.getStatus("ENG-1");

    expect(state).toEqual({ name: "In Progress", color: "#4ea7fc", type: "started" });
    const entry = svc.cache.getEntry("ENG-1");
    expect(entry).toMatchObject({ summary: "", issueUpdatedAt: "2026-01-01T00:00:00Z", summarizedAt: 0 });
  });

  it("resets the cached summary once the issue's updatedAt changes on Linear", async () => {
    initLinearService(fakePlugin());
    const svc = getLinearService()!;
    svc.cache.init({
      "ENG-1": { state: makeIssue().state as any, summary: "Old summary", issueUpdatedAt: "2026-01-01T00:00:00Z", summarizedAt: Date.now() },
    });

    mockedFetch.mockResolvedValue(makeIssue({ updatedAt: "2026-02-01T00:00:00Z" }) as any);
    await svc.getStatus("ENG-1");

    const entry = svc.cache.getEntry("ENG-1");
    expect(entry?.summary).toBe("");
    expect(entry?.issueUpdatedAt).toBe("2026-02-01T00:00:00Z");
  });

  it("does not touch the summary cache when the issue is unchanged (status-only refresh)", async () => {
    initLinearService(fakePlugin());
    const svc = getLinearService()!;
    // Recent timestamp so the entry survives init()'s aged-out pruning; the
    // test cares that getStatus leaves it untouched, not about the exact value.
    const summarizedAt = Date.now();
    svc.cache.init({
      "ENG-1": { state: makeIssue().state as any, summary: "Existing summary", issueUpdatedAt: "2026-01-01T00:00:00Z", summarizedAt },
    });

    mockedFetch.mockResolvedValue(makeIssue({ updatedAt: "2026-01-01T00:00:00Z" }) as any);
    await svc.getStatus("ENG-1");

    const entry = svc.cache.getEntry("ENG-1");
    expect(entry?.summary).toBe("Existing summary");
    expect(entry?.summarizedAt).toBe(summarizedAt);
  });
});

describe("LinearService issue caching", () => {
  it("serves a second lookup from cache instead of re-fetching", async () => {
    // `statusTtlMinutes` used to be inert on the path users actually hit:
    // only the uncalled getStatus consulted the cache, so every popover open
    // meant a fresh Linear round-trip regardless of the configured interval.
    mockedFetch.mockResolvedValue(makeIssue() as any);
    initLinearService(fakePlugin());
    const svc = getLinearService()!;

    await svc.getStatus("ENG-1");
    await svc.getStatus("ENG-1");

    expect(mockedFetch).toHaveBeenCalledTimes(1);
  });

  it("re-fetches once the status TTL has elapsed", async () => {
    mockedFetch.mockResolvedValue(makeIssue() as any);
    initLinearService(fakePlugin());
    const svc = getLinearService()!;

    const now = vi.spyOn(Date, "now");
    now.mockReturnValue(0);
    await svc.getStatus("ENG-1");
    now.mockReturnValue(6 * 60_000); // TTL is 5 minutes
    await svc.getStatus("ENG-1");
    now.mockRestore();

    expect(mockedFetch).toHaveBeenCalledTimes(2);
  });

  it("de-duplicates concurrent lookups of the same issue", async () => {
    // Ten badges for the same ticket in one note must cost one round-trip,
    // not ten (and, on the summary path, one LLM call rather than ten).
    let release: (v: unknown) => void = () => {};
    const pending = new Promise((r) => { release = r; });
    mockedFetch.mockReturnValue(pending as any);
    initLinearService(fakePlugin());
    const svc = getLinearService()!;

    const both = Promise.all([svc.getStatus("ENG-1"), svc.getStatus("ENG-1")]);
    // Let both calls get past their awaited key lookup and into getIssue.
    await Promise.resolve();
    await Promise.resolve();
    release(makeIssue());
    await both;

    expect(mockedFetch).toHaveBeenCalledTimes(1);
  });

  it("returns null without touching the network when the integration is off", async () => {
    initLinearService(fakePlugin({ linearEnabled: false }));
    await expect(getLinearService()!.getStatus("ENG-1")).resolves.toBeNull();
    expect(mockedFetch).not.toHaveBeenCalled();
  });
});

