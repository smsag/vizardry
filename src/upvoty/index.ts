import type { App, Plugin } from "obsidian";
import { Notice } from "obsidian";
import type { PluginSettings } from "../settings-schema";
import { loadSecret } from "../shared/keychain";
import { fetchUpvotyPost, fetchUpvotyComments, toUuid } from "./client";
import { summarizePost } from "./summarizer";
import { UpvotyCache } from "./cache";
import type { UpvotyPost } from "./types";
import { dedupe, createOnceGate } from "../shared/inflight";
import { t } from "../i18n";

// ── Module-level singleton ───────────────────────────────────────────────────

let _service: UpvotyService | null = null;
const authNotice = createOnceGate();

export function initUpvotyService(plugin: (Plugin & { app: App; settings: PluginSettings }) | null): void {
  _service = plugin ? new UpvotyService(plugin) : null;
  authNotice.reset();
}

export function getUpvotyService(): UpvotyService | null {
  return _service;
}

/** See `destroyLinearService` — the two teardowns are deliberately identical. */
export function destroyUpvotyService(): void {
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

// ── UpvotyService ────────────────────────────────────────────────────────────

class UpvotyService {
  private plugin: Plugin & { app: App; settings: PluginSettings };
  readonly cache: UpvotyCache;
  private inflightSummary = new Map<string, Promise<{ post: UpvotyPost; summary: string } | { error: string } | null>>();
  private inflightPost = new Map<string, Promise<UpvotyPost>>();

  constructor(plugin: Plugin & { app: App; settings: PluginSettings }) {
    this.plugin = plugin;
    this.cache = new UpvotyCache(plugin);
  }

  isEnabled(): boolean {
    return this.plugin.settings.upvotyEnabled;
  }

  getKeyPrefix(): string {
    return this.plugin.settings.upvotyKeyPrefix;
  }

  getAppUrl(): string {
    return this.plugin.settings.upvotyAppUrl;
  }

  private getUpvotyApiKey(): Promise<string | null> {
    return loadSecret(this.plugin.app, this.plugin.settings.upvotySecretName);
  }

  private getLlmApiKey(): Promise<string | null> {
    return loadSecret(this.plugin.app, this.plugin.settings.llmSecretName);
  }

  /**
   * A post can be written in a note either as the base62 slug from its URL or
   * as the UUID from the dashboard, and both address the same item. Keying
   * the caches on the canonical UUID means the two spellings share one cache
   * entry — otherwise the same post is fetched twice and, more expensively,
   * summarised twice by the LLM.
   */
  private cacheKey(postId: string): string {
    return toUuid(postId);
  }

  /**
   * The one place a post is fetched, served from cache while within
   * `upvotyStatusTtlMinutes`. That setting previously had no effect on the
   * popover path at all: only the (uncalled) `getPost` consulted the cache,
   * while `getSummary` re-fetched unconditionally.
   */
  private getCachedPost(postId: string, apiKey: string): Promise<UpvotyPost> {
    const key = this.cacheKey(postId);
    const cached = this.cache.getStatus(key, this.plugin.settings.upvotyStatusTtlMinutes);
    if (cached) return Promise.resolve(cached);

    return dedupe(this.inflightPost, key, async () => {
      const post = await fetchUpvotyPost(postId, this.plugin.settings.upvotyBaseUrl, apiKey);
      this.cache.setStatus(key, post);
      return post;
    });
  }

  /** Status-only fetch: the post itself, without paying for a summary. */
  async getPost(postId: string): Promise<UpvotyPost | { error: string }> {
    if (!this.isEnabled()) return { error: t("service.error.upvotyDisabled") };

    let apiKey: string | null;
    try {
      apiKey = await this.getUpvotyApiKey();
    } catch (err) {
      return { error: t("service.error.keyLookupFailed", { message: errorMessage(err) }) };
    }
    if (!apiKey) return { error: t("service.error.noUpvotyKeyShort") };

    try {
      return await this.getCachedPost(postId, apiKey);
    } catch (err) {
      console.warn(`Vizardry: UpvotyService.getPost("${postId}")`, err);
      return { error: errorMessage(err) };
    }
  }

  async getSummary(postId: string): Promise<{ post: UpvotyPost; summary: string } | { error: string } | null> {
    if (!this.isEnabled()) return null;

    return dedupe(this.inflightSummary, this.cacheKey(postId), async () => {
      let upvotyApiKey: string | null;
      let llmApiKey: string | null;
      try {
        [upvotyApiKey, llmApiKey] = await Promise.all([this.getUpvotyApiKey(), this.getLlmApiKey()]);
      } catch (err) {
        return { error: t("service.error.keyLookupFailed", { message: errorMessage(err) }) };
      }

      if (!upvotyApiKey) {
        return { error: t("service.error.noUpvotyKey", { secret: this.plugin.settings.upvotySecretName }) };
      }
      if (!llmApiKey) {
        return { error: t("service.error.noAiKey", { secret: this.plugin.settings.llmSecretName }) };
      }

      const { upvotyBaseUrl, summaryTtlHours, llmProvider, llmModel } = this.plugin.settings;
      const key = this.cacheKey(postId);

      try {
        const post = await this.getCachedPost(postId, upvotyApiKey);

        const cachedSummary = this.cache.getSummary(key, summaryTtlHours, post.updated_at);
        if (cachedSummary) return { post, summary: cachedSummary };

        const comments = await fetchUpvotyComments(postId, upvotyBaseUrl, upvotyApiKey);
        const summary = await summarizePost(post, comments, llmApiKey, llmProvider, llmModel);

        // Not awaited — see the matching note in LinearService.getSummary.
        this.cache.cacheSummary(key, {
          summary,
          postUpdatedAt: post.updated_at,
          summarizedAt: Date.now(),
        });

        return { post, summary };
      } catch (err) {
        const msg = errorMessage(err);
        console.warn(`Vizardry: UpvotyService.getSummary("${postId}")`, err);
        if (msg.toLowerCase().includes("invalid or missing api key") && authNotice.fire()) {
          new Notice(t("service.notice.upvotyAuth"), 8000);
        }
        return { error: msg };
      }
    });
  }
}

function errorMessage(err: unknown): string {
  return (err as Error)?.message ?? String(err);
}
