import { requestUrl } from "obsidian";
import type { UpvotyPost, UpvotyStatus, UpvotyAuthor } from "./types";

// Base62 alphabet used by Upvoty (standard: digits, uppercase, lowercase)
const B62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Converts a base62 URL slug (e.g. 5OdEIWLP5WQ1B2z7TnjE1o from post URLs after ~)
 * to standard UUID format required by the Upvoty REST API.
 * Passes through if the input is already a UUID or contains unexpected chars.
 */
function toUuid(id: string): string {
  if (UUID_RE.test(id)) return id;
  let n = BigInt(0);
  for (const c of id) {
    const i = B62.indexOf(c);
    if (i < 0) return id; // unrecognised char — pass through, API will reject
    n = n * BigInt(62) + BigInt(i);
  }
  const hex = n.toString(16).padStart(32, "0");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Fetches an Upvoty feedback item by its ID (base62 from the post URL after ~).
 * Uses ?expand=status,author to get full objects in one request.
 * Throws a descriptive error on auth failure, network error, or not-found.
 */
export async function fetchUpvotyPost(
  postId: string,
  baseUrl: string,
  apiKey: string,
): Promise<UpvotyPost> {
  const url = `${baseUrl.replace(/\/$/, "")}/feedback-items/${toUuid(postId)}?expand=status,author`;

  let resp;
  try {
    resp = await requestUrl({
      url,
      method: "GET",
      headers: { "X-Upvoty-Key": apiKey },
      throw: false,
    });
  } catch (err) {
    throw new Error(`Upvoty: network error — ${(err as Error).message}`);
  }

  if (resp.status === 401 || resp.status === 403) {
    throw new Error("Upvoty: invalid or missing API key");
  }
  if (resp.status === 404) {
    throw new Error(`Upvoty: feedback item "${postId}" not found`);
  }
  if (resp.status !== 200) {
    let detail = "";
    try { detail = ` — ${JSON.stringify(resp.json)}`; } catch { detail = ` — ${resp.text}`; }
    throw new Error(`Upvoty: HTTP ${resp.status}${detail}`);
  }

  const envelope = resp.json as { data?: Record<string, unknown> } & Record<string, unknown>;
  const data = (envelope["data"] as Record<string, unknown> | undefined) ?? envelope;

  return {
    id: (data["id"] as string) ?? postId,
    title: (data["title"] as string) ?? "",
    content: (data["content"] as string | null) ?? null,
    votes_count: (data["votes_count"] as number) ?? 0,
    status: (data["status"] as UpvotyStatus | null) ?? null,
    author: (data["author"] as UpvotyAuthor | null) ?? null,
    created_at: (data["created_at"] as string) ?? "",
    updated_at: (data["updated_at"] as string) ?? "",
  };
}

/**
 * Fetches the latest comments for an Upvoty feedback item (last 5, non-internal).
 * Returns an array of plain-text comment bodies (HTML stripped).
 */
export async function fetchUpvotyComments(
  postId: string,
  baseUrl: string,
  apiKey: string,
): Promise<string[]> {
  const url = `${baseUrl.replace(/\/$/, "")}/feedback-items/${toUuid(postId)}/comments?sort=-created_at&limit=5`;

  let resp;
  try {
    resp = await requestUrl({
      url,
      method: "GET",
      headers: { "X-Upvoty-Key": apiKey },
      throw: false,
    });
  } catch {
    return []; // comments are best-effort; don't fail the whole summary
  }

  if (resp.status !== 200) return [];

  const data = resp.json as { data?: { text?: string; internal?: boolean }[] };
  return (data.data ?? [])
    .filter(c => !c.internal && c.text)
    .map(c => stripHtml(c.text!))
    .filter(Boolean);
}

/** Strip HTML tags and decode basic HTML entities for plain-text display. */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}
