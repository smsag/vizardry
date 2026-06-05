import { requestUrl } from "obsidian";
import type { LinearIssue } from "./types";

const SYSTEM_PROMPT =
  "Summarise this Linear issue for a product roadmap in 2–3 sentences. " +
  "Focus on scope, user impact, and current status. Be concise and factual.";

/**
 * Generates a short LLM summary of a Linear issue.
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

  if (provider === "anthropic") {
    return summarizeAnthropic(userMessage, apiKey, model);
  }
  return summarizeOpenAI(userMessage, apiKey, model);
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
        max_tokens: 256,
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
        max_tokens: 256,
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
