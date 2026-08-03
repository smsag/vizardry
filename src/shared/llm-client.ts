import { requestUrl } from "obsidian";
import { withTimeout } from "./request-timeout";
import { withRetry429 } from "./request-retry";
import { LLM_REQUEST_TIMEOUT_MS } from "./constants";

export type LlmProvider = "anthropic" | "openai";

const MAX_TOKENS = 128;

/**
 * Per-provider differences: the endpoint, the auth/content headers, how the
 * system+user messages are shaped into the request body, and where the reply
 * text lives in the response JSON. Everything else — retry, timeout, status
 * handling, and error wording — is shared in `callLlm` so the two providers
 * can never drift apart in those respects.
 */
interface ProviderAdapter {
  /** Human-readable name used verbatim in every error message. */
  label: string;
  url: string;
  headers(apiKey: string): Record<string, string>;
  body(model: string, systemPrompt: string, userMessage: string): string;
  extractText(json: unknown): string | undefined;
}

const ADAPTERS: Record<LlmProvider, ProviderAdapter> = {
  anthropic: {
    label: "Anthropic",
    url: "https://api.anthropic.com/v1/messages",
    headers: (apiKey) => ({
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    }),
    body: (model, systemPrompt, userMessage) => JSON.stringify({
      model,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
    extractText: (json) =>
      (json as { content?: { type: string; text: string }[] }).content
        ?.find(c => c.type === "text")?.text,
  },
  openai: {
    label: "OpenAI",
    url: "https://api.openai.com/v1/chat/completions",
    headers: (apiKey) => ({
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    }),
    body: (model, systemPrompt, userMessage) => JSON.stringify({
      model,
      max_tokens: MAX_TOKENS,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
    }),
    extractText: (json) =>
      (json as { choices?: { message: { content: string } }[] }).choices?.[0]?.message?.content,
  },
};

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
  const adapter = ADAPTERS[provider];
  const { label } = adapter;

  let resp;
  try {
    resp = await withRetry429(() => withTimeout(requestUrl({
      url: adapter.url,
      method: "POST",
      headers: adapter.headers(apiKey),
      body: adapter.body(model, systemPrompt, userMessage),
      throw: false,
    }), LLM_REQUEST_TIMEOUT_MS, label));
  } catch (err) {
    throw new Error(`${label}: network error — ${(err as Error).message}`);
  }

  if (resp.status === 401) throw new Error(`${label}: invalid API key`);
  if (resp.status !== 200) throw new Error(`${label}: unexpected response ${resp.status}`);

  const text = adapter.extractText(resp.json);
  if (!text) throw new Error(`${label}: empty response`);
  return text.trim();
}

/** Truncates text to maxChars at the nearest word boundary, appending "…". */
export function truncateSummary(text: string, maxChars = 200): string {
  if (text.length <= maxChars) return text;
  const cut = text.slice(0, maxChars).replace(/\s+\S*$/, "");
  return cut + "…";
}
