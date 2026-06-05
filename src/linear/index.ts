import type { App, Plugin } from "obsidian";
import type { PluginSettings } from "../settings";
import { loadSecret } from "../shared/keychain";
import { fetchLinearIssue } from "./client";
import { summarizeIssue } from "./summarizer";
import { LinearCache } from "./cache";
import type { LinearState } from "./types";

// ── Module-level singleton ──────────────────────────────────────────────────

let _service: LinearService | null = null;

/**
 * Initialise (or tear down) the module-level LinearService.
 * Called from VizardryPlugin.onload() / onunload().
 * Pass null to tear down.
 */
export function initLinearService(plugin: (Plugin & { app: App; settings: PluginSettings }) | null): void {
  _service = plugin ? new LinearService(plugin) : null;
}

/** Returns the active LinearService, or null if not initialised / disabled. */
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

  /**
   * Returns true when the integration is enabled. Key presence is checked
   * lazily in getStatus/getSummary since loading them is now async.
   */
  isEnabled(): boolean {
    return this.plugin.settings.linearEnabled;
  }

  private async getLinearApiKey(): Promise<string | null> {
    return loadSecret(this.plugin.app, this.plugin.settings.linearSecretName);
  }

  private async getLlmApiKey(): Promise<string | null> {
    return loadSecret(this.plugin.app, this.plugin.settings.llmSecretName);
  }

  /**
   * Fetches and caches the current status of a Linear issue.
   * Returns null when the integration is disabled, keys are missing, or an
   * error occurs (errors are logged but not re-thrown so UI stays clean).
   */
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
      // Opportunistically warm the summary cache entry (state only, no summary yet)
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

  /**
   * Fetches the issue from Linear, summarises it with the configured LLM,
   * and caches the result. Subsequent calls within the TTL return the cached
   * summary without any network requests.
   *
   * Returns null on error or when integration is disabled.
   */
  async getSummary(issueKey: string): Promise<{ title: string; summary: string; state: LinearState; updatedAt: string } | null> {
    if (!this.isEnabled()) return null;

    const [linearApiKey, llmApiKey] = await Promise.all([this.getLinearApiKey(), this.getLlmApiKey()]);
    if (!linearApiKey || !llmApiKey) return null;

    const { summaryTtlHours, linearBaseUrl, llmProvider, llmModel } = this.plugin.settings;

    try {
      const issue = await fetchLinearIssue(issueKey, linearApiKey, linearBaseUrl);
      this.cache.setStatus(issueKey, issue.state);

      const cachedSummary = this.cache.getSummary(issueKey, summaryTtlHours, issue.updatedAt);
      if (cachedSummary) {
        return { title: issue.title, summary: cachedSummary, state: issue.state, updatedAt: issue.updatedAt };
      }

      const summary = await summarizeIssue(issue, llmApiKey, llmProvider, llmModel);
      await this.cache.setSummary(issueKey, {
        state: issue.state,
        summary,
        issueUpdatedAt: issue.updatedAt,
        summarizedAt: Date.now(),
      });

      return { title: issue.title, summary, state: issue.state, updatedAt: issue.updatedAt };
    } catch (err) {
      console.warn(`Vizardry: LinearService.getSummary("${issueKey}")`, err);
      return null;
    }
  }
}
