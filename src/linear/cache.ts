import type { Plugin } from "obsidian";
import type { CacheEntry, LinearState } from "./types";
import { IntegrationCache } from "../shared/integration-cache";

export class LinearCache extends IntegrationCache<LinearState, CacheEntry> {
  constructor(plugin: Plugin) {
    super(plugin, "linearCache", (entry) => entry.issueUpdatedAt);
  }
}
