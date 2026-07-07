import type { LinearIssue } from "./types";
import { callLlm, truncateSummary, type LlmProvider } from "../shared/llm-client";

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

/**
 * Generates a BLUF status update for a Linear issue (≤200 chars).
 * Supports Anthropic (claude-*) and OpenAI (gpt-*) models.
 */
export async function summarizeIssue(
  issue: LinearIssue,
  apiKey: string,
  provider: LlmProvider,
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

  const raw = await callLlm(provider, apiKey, model, systemPrompt, userMessage);
  return truncateSummary(raw);
}
