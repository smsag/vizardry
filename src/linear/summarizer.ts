import { requestUrl } from "obsidian";
import type { LinearIssue } from "./types";

function buildSystemPrompt(stateCategory: string): string {
  const focusMap: Record<string, string> = {
    completed: "What was the resolution and what changed? Focus on the fix or outcome.",
    cancelled:  "Why was it cancelled or what made it obsolete?",
    started:    "What is actively happening right now? What is blocking progress or what is the next concrete step?",
    unstarted:  "What decision, prerequisite, or open question still needs to be resolved before work can begin?",
    backlog:    "What decision, prerequisite, or open question still needs to be resolved before work can begin?",
  };
  const focus = focusMap[stateCategory] ?? "What is the current state, any blockers, and what is being actively discussed?";

  return (
    "You are a product assistant writing BLUF status updates for a roadmap. " +
    "The reader already knows the issue title — do NOT restate or paraphrase it. " +
    `This issue is in state category "${stateCategory}". ${focus} ` +
    "Write one sentence of plain prose, no markdown, no bullets. Do not exceed 200 characters."
  );
}

const MAX_CHARS = 200;

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
  const stateCategory = issue.state.type ?? issue.state.name.toLowerCase();
  const systemPrompt = buildSystemPrompt(stateCategory);

  const commentSection = issue.comments.length > 0
    ? "\n\nComments:\n" + issue.comments.map(c => `${c.author}: ${c.body}`).join("\n\n")
    : "";

  const userMessage =
    `Title: ${issue.title}\n` +
    `Status: ${issue.state.name}\n\n` +
    `Description: ${issue.description || "(no description)"}` +
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
