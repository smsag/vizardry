import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("obsidian", () => ({
  Notice: class Notice { constructor(_msg: string) {} },
  // i18n resolves the locale through moment on its first `t()` call, which
  // the disabled-integration paths reach.
  moment: { locale: () => "en" },
}));
vi.mock("../shared/keychain", () => ({ loadSecret: vi.fn().mockResolvedValue("api-key") }));
vi.mock("./client", async () => {
  const actual = await vi.importActual<typeof import("./client")>("./client");
  return { ...actual, fetchUpvotyPost: vi.fn(), fetchUpvotyComments: vi.fn().mockResolvedValue([]) };
});

import { fetchUpvotyPost } from "./client";
import { initUpvotyService, getUpvotyService } from "./index";

const mockedFetch = vi.mocked(fetchUpvotyPost);

// The same feedback item written two ways: the base62 slug from a post URL,
// and the UUID it decodes to (what the dashboard shows).
const SLUG = "5OdEIWLP5WQ1B2z7TnjE1o";
const POST = {
  id: "p1", title: "T", content: null, votes_count: 0,
  status: null, author: null,
  created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
};

function fakePlugin(overrides: Record<string, unknown> = {}) {
  return {
    app: {},
    settings: {
      upvotyEnabled: true,
      upvotySecretName: "key",
      llmSecretName: "llm-key",
      upvotyBaseUrl: "https://api.upvotyfeedback.com/v1",
      upvotyAppUrl: "https://app.upvoty.com/feedback",
      upvotyKeyPrefix: "UPV",
      upvotyStatusTtlMinutes: 5,
      summaryTtlHours: 24,
      ...overrides,
    },
    loadData: vi.fn().mockResolvedValue({}),
    saveData: vi.fn().mockResolvedValue(undefined),
  } as never;
}

beforeEach(() => {
  mockedFetch.mockReset();
  mockedFetch.mockResolvedValue(POST as never);
});

describe("UpvotyService post caching", () => {
  it("serves a second lookup from cache instead of re-fetching", async () => {
    initUpvotyService(fakePlugin());
    const svc = getUpvotyService()!;

    await svc.getPost(SLUG);
    await svc.getPost(SLUG);

    expect(mockedFetch).toHaveBeenCalledTimes(1);
  });

  it("re-fetches once upvotyStatusTtlMinutes has elapsed", async () => {
    initUpvotyService(fakePlugin());
    const svc = getUpvotyService()!;

    const now = vi.spyOn(Date, "now");
    now.mockReturnValue(0);
    await svc.getPost(SLUG);
    now.mockReturnValue(6 * 60_000);
    await svc.getPost(SLUG);
    now.mockRestore();

    expect(mockedFetch).toHaveBeenCalledTimes(2);
  });

  it("treats the base62 slug and its UUID as one cached post", async () => {
    // Both spellings address the same feedback item. Keyed on the raw id, the
    // second spelling missed the cache and paid for its own fetch and its own
    // LLM summarisation of identical content.
    const { toUuid } = await vi.importActual<typeof import("./client")>("./client");
    initUpvotyService(fakePlugin());
    const svc = getUpvotyService()!;

    await svc.getPost(SLUG);
    await svc.getPost(toUuid(SLUG));

    expect(mockedFetch).toHaveBeenCalledTimes(1);
  });

  it("reports the integration being off rather than fetching", async () => {
    initUpvotyService(fakePlugin({ upvotyEnabled: false }));
    const result = await getUpvotyService()!.getPost(SLUG);
    expect(result).toHaveProperty("error");
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it("returns null from getSummary when the integration is off", async () => {
    initUpvotyService(fakePlugin({ upvotyEnabled: false }));
    await expect(getUpvotyService()!.getSummary(SLUG)).resolves.toBeNull();
  });
});
