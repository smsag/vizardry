/**
 * Lightweight stub for the `obsidian` runtime module.
 *
 * Vitest cannot resolve the real `obsidian` package (it is injected by the
 * Obsidian host at runtime). This file is aliased in vitest.config.ts so that
 * renderer tests can import files that depend on `obsidian` without crashing.
 *
 * Only the symbols actually used by Vizardry source files are exported.
 * Add stubs here as needed when new Obsidian APIs are used.
 */

// setIcon is called by controls.ts, canvas.ts, story.ts.
// In tests we don't care about icon rendering — the no-op is sufficient.
export const setIcon = (_el: HTMLElement, _iconId: string): void => {};

// MarkdownView is used in block-edit.ts for instanceof checks.
export class MarkdownView {
  file: { path: string } | null = null;
  editor = null;
}

// WorkspaceLeaf / ItemView — the sideleaf view extends ItemView, so the stub
// needs just enough of the base class for the view to construct and render:
// contentEl (where it builds its chrome) and a no-op setState to super() into.
export class WorkspaceLeaf {
  view: unknown = null;
  setViewState = async (_state: unknown): Promise<void> => {};
  getViewState = (): unknown => ({});
}

export class ItemView {
  leaf: WorkspaceLeaf;
  containerEl: HTMLElement;
  contentEl: HTMLElement;
  constructor(leaf: WorkspaceLeaf) {
    this.leaf = leaf;
    this.containerEl = document.createElement("div");
    this.contentEl = this.containerEl.appendChild(document.createElement("div"));
  }
  setState(_state: unknown, _result: unknown): Promise<void> { return Promise.resolve(); }
  getState(): unknown { return {}; }
  registerEvent(_ref: unknown): void {}
}

// Plugin base class — not used by renderer tests but imported transitively.
export class Plugin {
  app: unknown = {};
  manifest: { version: string } = { version: "0.0.0" };
  registerMarkdownCodeBlockProcessor = () => {};
  addRibbonIcon = () => ({});
  addCommand = () => {};
}

// moment is used by i18n/index.ts for locale detection.
export const moment = {
  locale: () => "en",
};

// Platform — renderers read isMobile for compact layouts. Default: desktop.
export const Platform = { isMobile: false, isDesktop: true };

// Notice is used in main.ts — stub to avoid import errors.
export class Notice {
  constructor(_msg: string) {}
}

// MarkdownPostProcessorContext — used as a type only in most renderers.
export class MarkdownView_ {}
