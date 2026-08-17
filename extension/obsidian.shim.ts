/**
 * Extension-specific Obsidian shim. Re-exports everything from the visual
 * harness shim but replaces the no-op setIcon with real inline SVG icons.
 */

export { Platform, MarkdownView, Notice, moment, MarkdownRenderer, Component, requestUrl } from "../visual/obsidian.shim";

import { setIconImpl } from "./icons";
export const setIcon = setIconImpl;
