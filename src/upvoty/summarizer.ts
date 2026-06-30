import { requestUrl } from "obsidian";
import type { UpvotyPost } from "./types";
import { stripHtml } from "./client";

function buildSystemPrompt(): string {
  return (
    "You are a product assistant writing BLUF summaries of customer feature requests. " +
    "The reader already knows the request title — do NOT restate or paraphrase it. " +
    "Synthesise the description and any voter comments into one sentence of plain prose: " +
    "what the user actually needs, what pain it solves, and any recurring theme across comments. " +
    "No markdown, no bullets. Do not exceed 200 characters."
  );
}

const MAX_CHARS = 200;

function enforce(text: string): string {
  if (text.length <= MAX_CHARS) return text;
  const cut = text.slice(0, MAX_CHARS).replace(/\s+\S*$/, "");
  return cut + "…";
}

export async function summarizePost(
  post: UpvotyPost,
  comments: string[],
  apiKey: string,
  provider: "anthropic" | "openai",
  model: string,
): Promise<string> {
  const systemPrompt = buildSystemPrompt();

  const description = post.content ? stripHtml(post.content) : "(no description)";
  const commentSection = comments.length > 0
    ? "\n\nVoter comments:\n" + comments.join("\n")
    : "";

  const userMessage =
    `Title: ${post.title}\n` +
    `Status: ${post.status?.label ?? "No status"}\n` +
    `Votes: ${post.votes_count}\n\n` +
    `Description: ${description}` +
    commentSection;

  const raw = provider === "anthropic"
    ? await summarizeAnthropic(userMessage, apiKey, model, systemPrompt)
    : await summarizeOpenAI(userMessage, apiKey, model, systemPrompt);
  return enforce(raw);
}

async function summarizeAnthropic(
  userMessage: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
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
        system: systemPrompt,
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
  systemPrompt: string,
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
          { role: "system", content: systemPrompt },
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
