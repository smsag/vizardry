/**
 * Tests for llm-client.ts — the shared Anthropic/OpenAI request helper used
 * by the Linear and Upvoty summarizers.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("obsidian", () => ({
  requestUrl: vi.fn(),
}));

import { requestUrl } from "obsidian";
import { callLlm, truncateSummary } from "./llm-client";

const mockedRequestUrl = vi.mocked(requestUrl);

beforeEach(() => {
  mockedRequestUrl.mockReset();
});

describe("callLlm — Anthropic", () => {
  it("returns the response text on success", async () => {
    mockedRequestUrl.mockResolvedValue({
      status: 200,
      json: { content: [{ type: "text", text: "  summary text  " }] },
    } as any);
    const text = await callLlm("anthropic", "key", "model", "sys", "user");
    expect(text).toBe("summary text");
  });

  it("reports an invalid API key on a 401 status (not a generic network error)", async () => {
    mockedRequestUrl.mockResolvedValue({ status: 401, json: {} } as any);
    await expect(callLlm("anthropic", "bad-key", "model", "sys", "user"))
      .rejects.toThrow("Anthropic: invalid API key");
  });

  it("reports the status code for other non-200 responses", async () => {
    mockedRequestUrl.mockResolvedValue({ status: 429, json: {} } as any);
    await expect(callLlm("anthropic", "key", "model", "sys", "user"))
      .rejects.toThrow("Anthropic: unexpected response 429");
  });

  it("passes throw: false so requestUrl resolves instead of throwing on non-2xx", async () => {
    mockedRequestUrl.mockResolvedValue({ status: 401, json: {} } as any);
    await callLlm("anthropic", "key", "model", "sys", "user").catch(() => {});
    expect(mockedRequestUrl.mock.calls[0][0]).toMatchObject({ throw: false });
  });

  it("wraps a genuine request failure as a network error", async () => {
    mockedRequestUrl.mockRejectedValue(new Error("ECONNRESET"));
    await expect(callLlm("anthropic", "key", "model", "sys", "user"))
      .rejects.toThrow("Anthropic: network error — ECONNRESET");
  });
});

describe("callLlm — OpenAI", () => {
  it("returns the response text on success", async () => {
    mockedRequestUrl.mockResolvedValue({
      status: 200,
      json: { choices: [{ message: { content: "  summary  " } }] },
    } as any);
    const text = await callLlm("openai", "key", "model", "sys", "user");
    expect(text).toBe("summary");
  });

  it("reports an invalid API key on a 401 status (not a generic network error)", async () => {
    mockedRequestUrl.mockResolvedValue({ status: 401, json: {} } as any);
    await expect(callLlm("openai", "bad-key", "model", "sys", "user"))
      .rejects.toThrow("OpenAI: invalid API key");
  });

  it("passes throw: false so requestUrl resolves instead of throwing on non-2xx", async () => {
    mockedRequestUrl.mockResolvedValue({ status: 500, json: {} } as any);
    await callLlm("openai", "key", "model", "sys", "user").catch(() => {});
    expect(mockedRequestUrl.mock.calls[0][0]).toMatchObject({ throw: false });
  });
});

describe("callLlm — timeout", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("gives up and reports a network error if the request never resolves", async () => {
    mockedRequestUrl.mockReturnValue(new Promise(() => {}) as ReturnType<typeof requestUrl>); // never settles
    const p = callLlm("anthropic", "key", "model", "sys", "user");
    const assertion = expect(p).rejects.toThrow(/Anthropic: network error.*timed out/);
    await vi.runAllTimersAsync();
    await assertion;
  });
});

describe("truncateSummary", () => {
  it("leaves short text untouched", () => {
    expect(truncateSummary("short", 200)).toBe("short");
  });

  it("truncates at the nearest word boundary and appends an ellipsis", () => {
    expect(truncateSummary("one two three four", 11)).toBe("one two…");
  });
});
