import type { UpvotyPost } from "./types";
import { stripHtml } from "./client";
import { callLlm, truncateSummary, type LlmProvider } from "../shared/llm-client";

function buildSystemPrompt(): string {
  return (
    "You are a product assistant writing BLUF summaries of customer feature requests. " +
    "The reader already knows the request title — do NOT restate or paraphrase it. " +
    "Synthesise the description and any voter comments into one sentence of plain prose: " +
    "what the user actually needs, what pain it solves, and any recurring theme across comments. " +
    "No markdown, no bullets. Do not exceed 200 characters."
  );
}

export async function summarizePost(
  post: UpvotyPost,
  comments: string[],
  apiKey: string,
  provider: LlmProvider,
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

  const raw = await callLlm(provider, apiKey, model, systemPrompt, userMessage);
  return truncateSummary(raw);
}
