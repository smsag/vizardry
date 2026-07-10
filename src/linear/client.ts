import { requestUrl } from "obsidian";
import type { LinearIssue } from "./types";
import { withTimeout } from "../shared/request-timeout";
import { withRetry429 } from "../shared/request-retry";
import { INTEGRATION_REQUEST_TIMEOUT_MS } from "../shared/constants";

const QUERY = `
query Issue($id: String!) {
  issue(id: $id) {
    identifier
    title
    description
    updatedAt
    url
    state { name color type }
    assignee { name }
    comments(last: 5, orderBy: createdAt) {
      nodes { body user { name } }
    }
  }
}
`.trim();

/**
 * Fetches a Linear issue by its identifier (e.g. "CORE-1234").
 * Throws a descriptive error on auth failure, network error, or not-found.
 */
export async function fetchLinearIssue(
  issueKey: string,
  apiKey: string,
  baseUrl: string,
): Promise<LinearIssue> {
  let resp;
  try {
    resp = await withRetry429(() => withTimeout(requestUrl({
      url: baseUrl,
      method: "POST",
      contentType: "application/json",
      headers: { "Authorization": apiKey },
      body: JSON.stringify({ query: QUERY, variables: { id: issueKey } }),
      throw: false,
    }), INTEGRATION_REQUEST_TIMEOUT_MS, "Linear"));
  } catch (err) {
    throw new Error(`Linear: network error — ${(err as Error).message}`);
  }

  if (resp.status === 401 || resp.status === 403) {
    throw new Error("Linear: invalid or missing API key");
  }
  if (resp.status !== 200) {
    let detail = "";
    try { detail = ` — ${JSON.stringify(resp.json)}`; } catch { detail = ` — ${resp.text}`; }
    throw new Error(`Linear: HTTP ${resp.status}${detail}`);
  }

  const json = resp.json as { data?: { issue?: Record<string, unknown> }; errors?: { message: string }[] };

  if (json.errors?.length) {
    const msg = json.errors[0].message;
    if (msg.toLowerCase().includes("not found") || msg.toLowerCase().includes("entity not found")) {
      throw new Error(`Linear: issue "${issueKey}" not found`);
    }
    throw new Error(`Linear: ${msg}`);
  }

  const issue = json.data?.issue;
  if (!issue) throw new Error(`Linear: issue "${issueKey}" not found`);

  // type "unknown" (not a real Linear state type) deliberately doesn't match
  // any summarizer focusMap key, so a genuinely null/missing state falls
  // through to the summarizer's generic fallback instead of being
  // miscategorized as "unstarted" (which skews the LLM prompt's focus).
  const state = issue.state as { name: string; color: string; type: string } | null ?? { name: "Unknown", color: "#888", type: "unknown" };
  const comments = (
    (issue.comments as { nodes: { body: string; user: { name: string } }[] })?.nodes ?? []
  ).map(c => ({ body: c.body ?? "", author: c.user?.name ?? "Unknown" }));

  return {
    key: (issue.identifier as string) || issueKey,
    title: (issue.title as string) || "",
    description: (issue.description as string) || "",
    state,
    assignee: (issue.assignee as { name: string } | null)?.name ?? null,
    comments,
    updatedAt: (issue.updatedAt as string) || "",
    url: (issue.url as string) || "",
  };
}
