import "../src/shared/obsidian-dom-polyfill";
import type { App, MarkdownPostProcessorContext } from "obsidian";

/**
 * The slice of Obsidian's `App` and post-processor context the render path
 * touches. The viewer has no vault, no workspace and no metadata cache, so
 * every lookup answers "nothing here": links stay unresolved, headings are
 * empty, and files never exist. Typed as the real Obsidian types so the
 * dispatcher's signature is honoured — a renderer that starts reading a new
 * `app` property fails to compile here instead of throwing in the viewer.
 */
export type ViewerApp = App;
export type ViewerContext = MarkdownPostProcessorContext;

const appStub = {
  workspace: {
    getActiveViewOfType: () => null,
    getLeavesOfType: () => [],
    openLinkText: () => {},
  },
  metadataCache: {
    getFileCache: () => ({ headings: [] }),
  },
  vault: {
    getFileByPath: () => null,
    cachedRead: async () => "",
  },
};

export const app: ViewerApp = appStub as unknown as ViewerApp;

export const ctx: ViewerContext = {
  sourcePath: "viewer.md",
  getSectionInfo: () => null,
} as unknown as ViewerContext;
