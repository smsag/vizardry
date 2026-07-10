import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("obsidian", () => ({ requestUrl: vi.fn() }));

import { requestUrl } from "obsidian";
import { fetchLinearIssue } from "./client";

const mockedRequestUrl = vi.mocked(requestUrl);

beforeEach(() => mockedRequestUrl.mockReset());

function graphqlResponse(issue: Record<string, unknown>) {
  return { status: 200, json: { data: { issue } } } as any;
}

describe("fetchLinearIssue", () => {
  it("passes the real state through unchanged", async () => {
    mockedRequestUrl.mockResolvedValue(graphqlResponse({
      identifier: "ENG-1", title: "T", description: "", updatedAt: "", url: "",
      state: { name: "In Progress", color: "#4ea7fc", type: "started" },
      assignee: null, comments: { nodes: [] },
    }));
    const issue = await fetchLinearIssue("ENG-1", "key", "https://api.linear.app/graphql");
    expect(issue.state).toEqual({ name: "In Progress", color: "#4ea7fc", type: "started" });
  });

  it("falls back to type \"unknown\" (not \"unstarted\") when Linear returns a null state", async () => {
    mockedRequestUrl.mockResolvedValue(graphqlResponse({
      identifier: "ENG-1", title: "T", description: "", updatedAt: "", url: "",
      state: null,
      assignee: null, comments: { nodes: [] },
    }));
    const issue = await fetchLinearIssue("ENG-1", "key", "https://api.linear.app/graphql");
    expect(issue.state.type).toBe("unknown");
    expect(issue.state.type).not.toBe("unstarted");
  });

  it("retries once on a 429 rate-limit response, then succeeds", async () => {
    vi.useFakeTimers();
    mockedRequestUrl
      .mockResolvedValueOnce({ status: 429 } as any)
      .mockResolvedValueOnce(graphqlResponse({
        identifier: "ENG-1", title: "T", description: "", updatedAt: "", url: "",
        state: { name: "Done", color: "#000", type: "completed" },
        assignee: null, comments: { nodes: [] },
      }));

    const promise = fetchLinearIssue("ENG-1", "key", "https://api.linear.app/graphql");
    await vi.runAllTimersAsync();
    const issue = await promise;

    expect(mockedRequestUrl).toHaveBeenCalledTimes(2);
    expect(issue.state.type).toBe("completed");
    vi.useRealTimers();
  });
});
