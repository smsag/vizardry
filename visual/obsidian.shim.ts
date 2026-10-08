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

export const Platform = { isMobile: false, isPhone: false, isDesktop: true };

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
 * `showAtPosition` deliberately draws nothing, which keeps the snapshots free
 * of menu chrome; it records what it would have shown on
 * `window.__vzdMenus`, so a browser check can assert the rows and where the
 * menu opened.
 */
interface ShownMenu { x: number; y: number; items: { title: string; warning: boolean; run: () => void }[] }

export class Menu {
  private items: ShownMenu["items"] = [];
  addItem(cb: (item: unknown) => void): this {
    const row = { title: "", warning: false, run: () => {} };
    const item = {
      setTitle: (t: string) => { row.title = t; return item; },
      setIcon: () => item,
      setWarning: (w: boolean) => { row.warning = w; return item; },
      onClick: (fn: () => void) => { row.run = fn; return item; },
    };
    cb(item);
    this.items.push(row);
    return this;
  }
  addSeparator(): this { return this; }
  showAtPosition(pos: { x: number; y: number }, _doc?: Document): this {
    const w = window as unknown as { __vzdMenus?: ShownMenu[] };
    (w.__vzdMenus ??= []).push({ ...pos, items: this.items });
    return this;
  }
  showAtMouseEvent(_evt: MouseEvent): this { return this; }
  hide(): this { return this; }
  close(): void {}
}
