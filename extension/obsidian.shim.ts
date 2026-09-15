/**
 * Extension-specific Obsidian shim. Re-exports everything from the visual
 * harness shim but replaces the no-op setIcon with real inline SVG icons.
 */

export { Platform, MarkdownView, Notice, moment, MarkdownRenderer, Component, requestUrl } from "../visual/obsidian.shim";

import { setIconImpl } from "./icons";
export const setIcon = setIconImpl;

/**
 * Menu — the actions menu canvas items open (see src/shared/item-menu.ts).
 * The browser viewer renders canvases read-only, so nothing here ever opens
 * one; the stub exists to satisfy the import and chains like the real API.
 */
export class Menu {
  addItem(_cb: (item: unknown) => void): this { return this; }
  addSeparator(): this { return this; }
  showAtPosition(_pos: { x: number; y: number }, _doc?: Document): this { return this; }
  showAtMouseEvent(_evt: MouseEvent): this { return this; }
  hide(): this { return this; }
  close(): void {}
}
