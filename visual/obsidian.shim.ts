/**
 * Browser shim for the `obsidian` module, used only by the visual-regression
 * harness (esbuild aliases "obsidian" to this file). It provides just the
 * runtime symbols the render path touches — the real Obsidian host injects the
 * genuine module at runtime, and the unit tests use src/__mocks__/obsidian.ts.
 *
 * `Platform` is a live object the harness mutates (isMobile) before rendering
 * the mobile fixtures, so renderers that branch on it see the right value.
 */

export const setIcon = (_el: HTMLElement, _iconId: string): void => {};

export const Platform = { isMobile: false, isDesktop: true };

export class MarkdownView {
  file: { path: string } | null = null;
  editor = null;
  getMode(): string { return "preview"; }
}

export class Notice {
  constructor(_message: string, _timeout?: number) {}
}

export const moment = { locale: (): string => "en" };

export const MarkdownRenderer = {
  render: async (): Promise<void> => {},
};

export class Component {
  load(): void {}
  unload(): void {}
}

export const requestUrl = async (): Promise<{ status: number; json: unknown; text: string }> => ({
  status: 200,
  json: {},
  text: "",
});

/**
 * Menu — the actions menu every canvas item opens (see shared/item-menu.ts).
 * The harness renders canvases but never opens a menu, so this only has to
 * exist and chain; `showAtPosition` deliberately draws nothing, which keeps
 * the snapshots free of menu chrome.
 */
export class Menu {
  addItem(_cb: (item: unknown) => void): this { return this; }
  addSeparator(): this { return this; }
  showAtPosition(_pos: { x: number; y: number }, _doc?: Document): this { return this; }
  showAtMouseEvent(_evt: MouseEvent): this { return this; }
  hide(): this { return this; }
  close(): void {}
}
