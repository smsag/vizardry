import { requestUrl } from "obsidian";
import type { LinearIssue } from "./types";

const SYSTEM_PROMPT =
  "You are a product assistant writing BLUF (Bottom Line Up Front) status updates for a roadmap. " +
  "Given a Linear issue, write a single short paragraph of at most 360 characters that covers: " +
  "(1) the intent — what problem this issue solves and why it matters, and " +
  "(2) the current state — progress made, what is blocking it, or what the next step is. " +
  "Use plain prose. No bullet points. No markdown. Do not exceed 360 characters.";

const MAX_CHARS = 360;

/** Truncates a summary to MAX_CHARS at the nearest word boundary, appending "…". */
function enforce(text: string): string {
  if (text.length <= MAX_CHARS) return text;
  const cut = text.slice(0, MAX_CHARS).replace(/\s+\S*$/, "");
  return cut + "…";
}

/**
 * Generates a BLUF status update for a Linear issue (≤360 chars).
 * Supports Anthropic (claude-*) and OpenAI (gpt-*) models.
 */
export async function summarizeIssue(
  issue: LinearIssue,
  apiKey: string,
  provider: "anthropic" | "openai",
  model: string,
): Promise<string> {
  const commentSection = issue.comments.length > 0
    ? "\n\nComments:\n" + issue.comments.map(c => `${c.author}: ${c.body}`).join("\n\n")
    : "";

  const userMessage =
    `Title: ${issue.title}\n\n` +
    `Description: ${issue.description || "(no description)"}` +
    commentSection;

  const raw = provider === "anthropic"
    ? await summarizeAnthropic(userMessage, apiKey, model)
    : await summarizeOpenAI(userMessage, apiKey, model);
  return enforce(raw);
}

async function summarizeAnthropic(
  userMessage: string,
  apiKey: string,
  model: string,
): Promise<string> {
  let resp;
  try {
    resp = await requestUrl({
      url: "https://api.anthropic.com/v1/messages",
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 128,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      }),
    });
  } catch (err) {
    throw new Error(`Anthropic: network error — ${(err as Error).message}`);
  }

  if (resp.status === 401) throw new Error("Anthropic: invalid API key");
  if (resp.status !== 200) throw new Error(`Anthropic: unexpected response ${resp.status}`);

  const json = resp.json as { content?: { type: string; text: string }[] };
  const text = json.content?.find(c => c.type === "text")?.text;
  if (!text) throw new Error("Anthropic: empty response");
  return text.trim();
}

async function summarizeOpenAI(
  userMessage: string,
  apiKey: string,
  model: string,
): Promise<string> {
  let resp;
  try {
    resp = await requestUrl({
      url: "https://api.openai.com/v1/chat/completions",
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 128,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
      }),
    });
  } catch (err) {
    throw new Error(`OpenAI: network error — ${(err as Error).message}`);
  }

  if (resp.status === 401) throw new Error("OpenAI: invalid API key");
  if (resp.status !== 200) throw new Error(`OpenAI: unexpected response ${resp.status}`);

  const json = resp.json as { choices?: { message: { content: string } }[] };
  const text = json.choices?.[0]?.message?.content;
  if (!text) throw new Error("OpenAI: empty response");
  return text.trim();
}
