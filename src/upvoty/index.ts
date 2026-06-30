import type { App, Plugin } from "obsidian";
import { Notice } from "obsidian";
import type { PluginSettings } from "../settings";
import { loadSecret } from "../shared/keychain";
import { fetchUpvotyPost, fetchUpvotyComments } from "./client";
import { summarizePost } from "./summarizer";
import { UpvotyCache } from "./cache";
import type { UpvotyPost } from "./types";

// ── Module-level singleton ───────────────────────────────────────────────────

let _service: UpvotyService | null = null;
let _authNoticeShown = false;

export function initUpvotyService(plugin: (Plugin & { app: App; settings: PluginSettings }) | null): void {
  _service = plugin ? new UpvotyService(plugin) : null;
  _authNoticeShown = false;
}

export function getUpvotyService(): UpvotyService | null {
  return _service;
}

export function destroyUpvotyService(): void {
  _service?.cache.clear();
  _service = null;
}

// ── UpvotyService ────────────────────────────────────────────────────────────

class UpvotyService {
  private plugin: Plugin & { app: App; settings: PluginSettings };
  readonly cache: UpvotyCache;

  constructor(plugin: Plugin & { app: App; settings: PluginSettings }) {
    this.plugin = plugin;
    this.cache = new UpvotyCache(plugin);
  }

  isEnabled(): boolean {
    return this.plugin.settings.upvotyEnabled;
  }

  getKeyPrefix(): string {
    return this.plugin.settings.upvotyKeyPrefix || "UPV";
  }

  private getUpvotyApiKey(): Promise<string | null> {
    return loadSecret(this.plugin.app, this.plugin.settings.upvotySecretName);
  }

  private getLlmApiKey(): Promise<string | null> {
    return loadSecret(this.plugin.app, this.plugin.settings.llmSecretName);
  }

  async getSummary(postId: string): Promise<
    { post: UpvotyPost; summary: string } | { error: string } | null
  > {
    if (!this.isEnabled()) return null;

    let upvotyApiKey: string | null;
    let llmApiKey: string | null;
    try {
      [upvotyApiKey, llmApiKey] = await Promise.all([this.getUpvotyApiKey(), this.getLlmApiKey()]);
    } catch (err) {
      return { error: `Key lookup failed: ${(err as Error).message ?? String(err)}` };
    }

    if (!upvotyApiKey) {
      return { error: `No Upvoty API key — check Settings → Vizardry (secret: "${this.plugin.settings.upvotySecretName}")` };
    }
    if (!llmApiKey) {
      return { error: `No AI API key — check Settings → Vizardry (secret: "${this.plugin.settings.llmSecretName}")` };
    }

    const { upvotyStatusTtlMinutes, upvotyBaseUrl, summaryTtlHours, llmProvider, llmModel } = this.plugin.settings;

    try {
      const post = await fetchUpvotyPost(postId, upvotyBaseUrl, upvotyApiKey);
      this.cache.setPost(postId, post);

      const cachedSummary = this.cache.getSummary(postId, summaryTtlHours, post.updated_at);
      if (cachedSummary) {
        return { post, summary: cachedSummary };
      }

      const comments = await fetchUpvotyComments(postId, upvotyBaseUrl, upvotyApiKey);
      const summary = await summarizePost(post, comments, llmApiKey, llmProvider, llmModel);

      await this.cache.setSummary(postId, {
        summary,
        postUpdatedAt: post.updated_at,
        summarizedAt: Date.now(),
      });

      return { post, summary };
    } catch (err) {
      const msg = (err as Error).message ?? String(err);
      console.warn(`Vizardry: UpvotyService.getSummary("${postId}")`, err);
      if (!_authNoticeShown && msg.toLowerCase().includes("invalid or missing api key")) {
        _authNoticeShown = true;
        new Notice("Vizardry: Upvoty API key is invalid or missing — check Settings → Vizardry.", 8000);
      }
      return { error: msg };
    }
  }

  /** Quick status-only fetch (used by roadmap cards). Returns cached post or fetches fresh. */
  async getPost(postId: string): Promise<UpvotyPost | { error: string }> {
    if (!this.isEnabled()) return { error: "Upvoty integration disabled." };

    let apiKey: string | null;
    try {
      apiKey = await this.getUpvotyApiKey();
    } catch (err) {
      return { error: `Key lookup failed: ${(err as Error).message ?? String(err)}` };
    }

    if (!apiKey) {
      return { error: `No Upvoty API key — check Settings → Vizardry` };
    }

    const cached = this.cache.getPost(postId, this.plugin.settings.upvotyStatusTtlMinutes);
    if (cached) return cached;

    try {
      const post = await fetchUpvotyPost(postId, this.plugin.settings.upvotyBaseUrl, apiKey);
      this.cache.setPost(postId, post);
      return post;
    } catch (err) {
      const msg = (err as Error).message ?? String(err);
      console.warn(`Vizardry: UpvotyService.getPost("${postId}")`, err);
      return { error: msg };
    }
  }
}
