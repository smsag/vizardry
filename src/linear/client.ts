import { requestUrl } from "obsidian";
import type { LinearIssue } from "./types";

const QUERY = `
query Issue($id: String!) {
  issue(id: $id) {
    identifier
    title
    description
    updatedAt
    state { name color }
    comments(last: 5, orderBy: createdAt) {
      nodes { body author { name } }
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
    resp = await requestUrl({
      url: baseUrl,
      method: "POST",
      headers: {
        "Authorization": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: QUERY, variables: { id: issueKey } }),
    });
  } catch (err) {
    throw new Error(`Linear: network error — ${(err as Error).message}`);
  }

  if (resp.status === 401 || resp.status === 403) {
    throw new Error("Linear: invalid or missing API key");
  }
  if (resp.status !== 200) {
    throw new Error(`Linear: unexpected response ${resp.status}`);
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

  const state = issue.state as { name: string; color: string } | null ?? { name: "Unknown", color: "#888" };
  const comments = (
    (issue.comments as { nodes: { body: string; author: { name: string } }[] })?.nodes ?? []
  ).map(c => ({ body: c.body ?? "", author: c.author?.name ?? "Unknown" }));

  return {
    key: (issue.identifier as string) || issueKey,
    title: (issue.title as string) || "",
    description: (issue.description as string) || "",
    state,
    comments,
    updatedAt: (issue.updatedAt as string) || "",
  };
}
