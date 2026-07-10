import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../shared/llm-client", async () => {
  const actual = await vi.importActual<typeof import("../shared/llm-client")>("../shared/llm-client");
  return { ...actual, callLlm: vi.fn().mockResolvedValue("a summary") };
});

import { callLlm } from "../shared/llm-client";
import { summarizeIssue } from "./summarizer";
import type { LinearIssue } from "./types";

const mockedCallLlm = vi.mocked(callLlm);

function makeIssue(overrides: Partial<LinearIssue> = {}): LinearIssue {
  return {
    key: "ENG-1",
    title: "Some issue",
    description: "",
    state: { name: "In Progress", color: "#4ea7fc", type: "started" },
    assignee: null,
    comments: [],
    updatedAt: "2026-01-01T00:00:00Z",
    url: "https://linear.app/x/issue/ENG-1",
    ...overrides,
  };
}

describe("summarizeIssue", () => {
  beforeEach(() => mockedCallLlm.mockClear());

  it("uses the started-state focus for an in-progress issue", async () => {
    await summarizeIssue(makeIssue(), "key", "anthropic", "model");
    const systemPrompt = mockedCallLlm.mock.calls[0][3];
    expect(systemPrompt).toContain("What is actively happening right now");
  });

  it("falls back to the generic focus for an unknown/missing state, instead of the misleading unstarted framing", async () => {
    // Mirrors linear/client.ts's fallback for a null Linear state: type
    // "unknown" must NOT match any focusMap key.
    const issue = makeIssue({ state: { name: "Unknown", color: "#888", type: "unknown" } });
    await summarizeIssue(issue, "key", "anthropic", "model");
    const systemPrompt = mockedCallLlm.mock.calls[0][3];
    expect(systemPrompt).toContain("What is the current state, any blockers");
    expect(systemPrompt).not.toContain("What decision, prerequisite, or open question");
  });
});
