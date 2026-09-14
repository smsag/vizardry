import type { Plugin } from "obsidian";
import type { CacheEntry, LinearIssue } from "./types";
import { IntegrationCache } from "../shared/integration-cache";

/**
 * The status layer caches the whole `LinearIssue`, not just its state: the
 * summary layer needs the issue's `updatedAt` to decide whether a cached
 * summary is still current, and fetching the issue again purely to read that
 * would make the status TTL pointless. Mirrors UpvotyCache, which caches the
 * whole post for the same reason.
 */
export class LinearCache extends IntegrationCache<LinearIssue, CacheEntry> {
  constructor(plugin: Plugin) {
    super(plugin, "linearCache", (entry) => entry.issueUpdatedAt);
  }
}
