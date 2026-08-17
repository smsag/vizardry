import type { Plugin } from "obsidian";
import type { UpvotyPost, UpvotyCacheEntry } from "./types";
import { IntegrationCache } from "../shared/integration-cache";

export class UpvotyCache extends IntegrationCache<UpvotyPost, UpvotyCacheEntry> {
  constructor(plugin: Plugin) {
    super(plugin, "upvotyCache", (entry) => entry.postUpdatedAt);
  }
}
