import { requestUrl } from "obsidian";
import { withTimeout } from "./request-timeout";
import { LLM_REQUEST_TIMEOUT_MS } from "./constants";

export type LlmProvider = "anthropic" | "openai";

/**
 * Calls the given LLM provider with a system + user message and returns the
 * raw response text (untruncated). Shared by every Vizardry feature that
 * asks an LLM for a short summary (Linear issues, Upvoty feedback items).
 */
export async function callLlm(
  provider: LlmProvider,
  apiKey: string,
  model: string,
  systemPrompt: string,
  userMessage: string,
): Promise<string> {
  return provider === "anthropic"
    ? callAnthropic(apiKey, model, systemPrompt, userMessage)
    : callOpenAI(apiKey, model, systemPrompt, userMessage);
}

async function callAnthropic(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userMessage: string,
): Promise<string> {
  let resp;
  try {
    resp = await withTimeout(requestUrl({
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
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      }),
      throw: false,
    }), LLM_REQUEST_TIMEOUT_MS, "Anthropic");
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

async function callOpenAI(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userMessage: string,
): Promise<string> {
  let resp;
  try {
    resp = await withTimeout(requestUrl({
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
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
      }),
      throw: false,
    }), LLM_REQUEST_TIMEOUT_MS, "OpenAI");
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

/** Truncates text to maxChars at the nearest word boundary, appending "…". */
export function truncateSummary(text: string, maxChars = 200): string {
  if (text.length <= maxChars) return text;
  const cut = text.slice(0, maxChars).replace(/\s+\S*$/, "");
  return cut + "…";
}
