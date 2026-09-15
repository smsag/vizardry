import type { App, Plugin } from "obsidian";
import { Notice } from "obsidian";
import type { PluginSettings } from "../settings-schema";
import { loadSecret } from "../shared/keychain";
import { fetchLinearIssue } from "./client";
import { summarizeIssue } from "./summarizer";
import { LinearCache } from "./cache";
import type { LinearIssue, LinearState } from "./types";
import { dedupe, createOnceGate } from "../shared/inflight";
import { t } from "../i18n";
import { IntegrationAuthError } from "../shared/errors";

// ── Module-level singleton ──────────────────────────────────────────────────

let _service: LinearService | null = null;

// Fired at most once per plugin session so the user isn't spammed.
const authNotice = createOnceGate();

export function initLinearService(plugin: (Plugin & { app: App; settings: PluginSettings }) | null): void {
  _service = plugin ? new LinearService(plugin) : null;
  authNotice.reset();
}

export function getLinearService(): LinearService | null {
  return _service;
}

/**
 * Tears the service down on plugin unload: flushes any coalesced cache write
 * so a summary generated seconds before unload isn't lost, then drops the
 * in-memory caches. Mirrors `destroyUpvotyService` — the two used to be
 * asymmetric (Linear had no counterpart at all), which made it easy to add a
 * teardown step to one and forget the other.
 */
export function destroyLinearService(): void {
  const service = _service;
  _service = null;
  authNotice.reset();
  if (service) {
    // `.then(done, done)`, not `.finally`: a failed final write must not
    // surface as an unhandled rejection during teardown, and the in-memory
    // caches have to be dropped either way.
    const done = (): void => service.cache.clear();
    void service.cache.flush().then(done, done);
  }
}

export type LinearSummary = {
  title: string;
  summary: string;
  state: LinearState;
  assignee: string | null;
  updatedAt: string;
  url: string;
};

// ── LinearService ───────────────────────────────────────────────────────────

class LinearService {
  private plugin: Plugin & { app: App; settings: PluginSettings };
  readonly cache: LinearCache;
  private inflightIssue = new Map<string, Promise<LinearIssue>>();
  private inflightSummary = new Map<string, Promise<LinearSummary | { error: string } | null>>();

  /**
   * Forgets everything fetched so far: the persisted cache *and* the requests
   * still in flight. Called when the credentials or base URL change — a fetch
   * started against the old workspace must not land in the cleared cache.
   */
  async reset(): Promise<void> {
    this.inflightIssue.clear();
    this.inflightSummary.clear();
    await this.cache.clearAndPersist();
  }

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

  /**
   * The one place an issue is fetched. Serves it from the status cache while
   * it is within `statusTtlMinutes` — which is what makes that setting mean
   * something: before, every popover open re-fetched from Linear regardless
   * of the configured refresh interval, because the cache was only ever read
   * by a code path nothing called.
   *
   * The whole issue is cached, not just its state: `getSummary` needs the
   * issue's `updatedAt` (and title/assignee/url) to decide whether its cached
   * summary is still valid, and re-fetching purely to learn that defeats the
   * cache.
   */
  private getIssue(issueKey: string, apiKey: string): Promise<LinearIssue> {
    const cached = this.cache.getStatus(issueKey, this.plugin.settings.statusTtlMinutes);
    if (cached) return Promise.resolve(cached);

    return dedupe(this.inflightIssue, issueKey, async () => {
      const issue = await fetchLinearIssue(issueKey, apiKey, this.plugin.settings.linearBaseUrl);
      this.cache.setStatus(issueKey, issue);
      this.rememberIssueVersion(issueKey, issue);
      return issue;
    });
  }

  /**
   * Keeps the persisted entry pinned to the issue version it describes. When
   * the issue has moved on (or was never seen), the stored summary no longer
   * describes it, so it is replaced by a placeholder rather than left to be
   * shown next to newer content until something regenerates it.
   */
  private rememberIssueVersion(issueKey: string, issue: LinearIssue): void {
    const entry = this.cache.getEntry(issueKey);
    if (entry && entry.issueUpdatedAt === issue.updatedAt) return;
    // The in-memory map is updated synchronously by setSummary; only the
    // data.json write is deferred (and coalesced), so nothing downstream
    // waits on the disk to render a popover.
    this.cache.cacheSummary(issueKey, {
      state: issue.state,
      summary: "",
      issueUpdatedAt: issue.updatedAt,
      summarizedAt: 0,
    });
  }

  /** Current workflow state of an issue, or null if it can't be determined. */
  async getStatus(issueKey: string): Promise<LinearState | null> {
    if (!this.isEnabled()) return null;
    const apiKey = await this.getLinearApiKey();
    if (!apiKey) return null;
    try {
      return (await this.getIssue(issueKey, apiKey)).state;
    } catch (err) {
      console.warn(`Vizardry: LinearService.getStatus("${issueKey}")`, err);
      return null;
    }
  }

  async getSummary(issueKey: string): Promise<LinearSummary | { error: string } | null> {
    if (!this.isEnabled()) return null;

    return dedupe(this.inflightSummary, issueKey, async () => {
      let linearApiKey: string | null;
      let llmApiKey: string | null;
      try {
        [linearApiKey, llmApiKey] = await Promise.all([this.getLinearApiKey(), this.getLlmApiKey()]);
      } catch (err) {
        console.warn("Vizardry: getSummary — key loading threw", err);
        return { error: t("service.error.keyLookupFailed", { message: errorMessage(err) }) };
      }

      if (!linearApiKey) return { error: t("service.error.noLinearKey", { secret: this.plugin.settings.linearSecretName }) };
      if (!llmApiKey) return { error: t("service.error.noAiKey", { secret: this.plugin.settings.llmSecretName }) };

      const { summaryTtlHours, llmProvider, llmModel } = this.plugin.settings;

      try {
        const issue = await this.getIssue(issueKey, linearApiKey);
        const base = {
          title: issue.title,
          state: issue.state,
          assignee: issue.assignee,
          updatedAt: issue.updatedAt,
          url: issue.url,
        };

        const cachedSummary = this.cache.getSummary(issueKey, summaryTtlHours, issue.updatedAt);
        if (cachedSummary) return { ...base, summary: cachedSummary };

        const summary = await summarizeIssue(issue, llmApiKey, llmProvider, llmModel);
        // Not awaited: the summary is already in memory for this and every
        // other badge on the page, and the popover should not sit on a
        // loading state waiting for a disk write.
        this.cache.cacheSummary(issueKey, {
          state: issue.state,
          summary,
          issueUpdatedAt: issue.updatedAt,
          summarizedAt: Date.now(),
        });

        return { ...base, summary };
      } catch (err) {
        const msg = errorMessage(err);
        console.warn(`Vizardry: LinearService.getSummary("${issueKey}")`, err);
        if (err instanceof IntegrationAuthError && authNotice.fire()) {
          new Notice(t("service.notice.linearAuth"), 8000);
        }
        return { error: msg };
      }
    });
  }
}

function errorMessage(err: unknown): string {
  return (err as Error)?.message ?? String(err);
}
