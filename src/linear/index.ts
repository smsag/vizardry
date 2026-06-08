import type { App, Plugin } from "obsidian";
import type { PluginSettings } from "../settings";
import { loadSecret } from "../shared/keychain";
import { fetchLinearIssue } from "./client";
import { summarizeIssue } from "./summarizer";
import { LinearCache } from "./cache";
import type { LinearState } from "./types";

// ── Module-level singleton ──────────────────────────────────────────────────

let _service: LinearService | null = null;

export function initLinearService(plugin: (Plugin & { app: App; settings: PluginSettings }) | null): void {
  _service = plugin ? new LinearService(plugin) : null;
}

export function getLinearService(): LinearService | null {
  return _service;
}

// ── LinearService ───────────────────────────────────────────────────────────

class LinearService {
  private plugin: Plugin & { app: App; settings: PluginSettings };
  readonly cache: LinearCache;

  constructor(plugin: Plugin & { app: App; settings: PluginSettings }) {
    this.plugin = plugin;
    this.cache = new LinearCache(plugin);
  }

  isEnabled(): boolean {
    return this.plugin.settings.linearEnabled;
  }

  private getLinearApiKey(): Promise<string | null> {
    return loadSecret(this.plugin.app, this.plugin.settings.linearSecretName);
  }

  private getLlmApiKey(): Promise<string | null> {
    return loadSecret(this.plugin.app, this.plugin.settings.llmSecretName);
  }

  async getStatus(issueKey: string): Promise<LinearState | null> {
    if (!this.isEnabled()) return null;

    const linearApiKey = await this.getLinearApiKey();
    if (!linearApiKey) return null;

    const { statusTtlMinutes, linearBaseUrl } = this.plugin.settings;
    const cached = this.cache.getStatus(issueKey, statusTtlMinutes);
    if (cached) return cached;

    try {
      const issue = await fetchLinearIssue(issueKey, linearApiKey, linearBaseUrl);
      this.cache.setStatus(issueKey, issue.state);
      const existing = this.cache.getEntry(issueKey);
      if (!existing || existing.issueUpdatedAt !== issue.updatedAt) {
        await this.cache.setSummary(issueKey, {
          state: issue.state,
          summary: existing?.issueUpdatedAt === issue.updatedAt ? (existing?.summary ?? "") : "",
          issueUpdatedAt: issue.updatedAt,
          summarizedAt: existing?.issueUpdatedAt === issue.updatedAt ? (existing?.summarizedAt ?? 0) : 0,
        });
      }
      return issue.state;
    } catch (err) {
      console.warn(`Vizardry: LinearService.getStatus("${issueKey}")`, err);
      return null;
    }
  }

  async getSummary(issueKey: string): Promise<{ title: string; summary: string; state: LinearState; assignee: string | null; updatedAt: string } | { error: string } | null> {
    if (!this.isEnabled()) return null;

    let linearApiKey: string | null;
    let llmApiKey: string | null;
    try {
      [linearApiKey, llmApiKey] = await Promise.all([this.getLinearApiKey(), this.getLlmApiKey()]);
    } catch (err) {
      console.warn("Vizardry: getSummary — key loading threw", err);
      return { error: `Key lookup failed: ${(err as Error).message ?? String(err)}` };
    }

    if (!linearApiKey) return { error: `No Linear API key — check Settings → Vizardry (secret: "${this.plugin.settings.linearSecretName}")` };
    if (!llmApiKey) return { error: `No AI API key — check Settings → Vizardry (secret: "${this.plugin.settings.llmSecretName}")` };

    const { summaryTtlHours, linearBaseUrl, llmProvider, llmModel } = this.plugin.settings;

    try {
      const issue = await fetchLinearIssue(issueKey, linearApiKey, linearBaseUrl);
      this.cache.setStatus(issueKey, issue.state);

      const cachedSummary = this.cache.getSummary(issueKey, summaryTtlHours, issue.updatedAt);
      if (cachedSummary) {
        return { title: issue.title, summary: cachedSummary, state: issue.state, assignee: issue.assignee, updatedAt: issue.updatedAt };
      }

      const summary = await summarizeIssue(issue, llmApiKey, llmProvider, llmModel);
      await this.cache.setSummary(issueKey, {
        state: issue.state,
        summary,
        issueUpdatedAt: issue.updatedAt,
        summarizedAt: Date.now(),
      });

      return { title: issue.title, summary, state: issue.state, assignee: issue.assignee, updatedAt: issue.updatedAt };
    } catch (err) {
      const msg = (err as Error).message ?? String(err);
      console.warn(`Vizardry: LinearService.getSummary("${issueKey}")`, err);
      return { error: msg };
    }
  }
}
