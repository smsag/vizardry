import { Lexer, Parser, type Token, type TokensList } from "marked";
import { dispatchVizardry } from "../src/vizardry-dispatch";
import { appendSanitizedHtml } from "./sanitize";
import type { ViewerApp, ViewerContext } from "./obsidian-polyfills";

const VIZARDRY_LANG = "vizardry";

/**
 * Renders a Markdown document into `container`: prose through `marked` (then
 * sanitised), every ```vizardry fence through the plugin's own dispatcher.
 *
 * A render error in one canvas is shown in place of that canvas and does not
 * stop the rest of the document from rendering.
 */
export function renderDocument(
  markdown: string,
  container: HTMLElement,
  app: ViewerApp,
  ctx: ViewerContext,
): void {
  const tokens = Lexer.lex(markdown);
  // Reference-style links ([text][ref] … [ref]: url) live on the token list,
  // not on the tokens: each prose slice must carry them or the links resolve
  // to nothing.
  const withLinks = (slice: Token[]): TokensList =>
    Object.assign(slice, { links: tokens.links }) as TokensList;

  let proseBuf: Token[] = [];

  const flushProse = (): void => {
    if (proseBuf.length === 0) return;
    const html = Parser.parse(withLinks(proseBuf));
    const prose = container.createEl("div", { cls: "vzd-ext-prose" });
    appendSanitizedHtml(prose, html);
    proseBuf = [];
  };

  for (const token of tokens) {
    if (token.type === "code" && token.lang === VIZARDRY_LANG) {
      flushProse();
      const host = container.createEl("div", { cls: "vzd-ext-canvas-host" });
      try {
        dispatchVizardry(token.text, host, ctx, app);
      } catch (err) {
        host.empty();
        host.createEl("pre", {
          cls: "vzd-ext-error",
          text: `Render error: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    } else {
      proseBuf.push(token);
    }
  }

  flushProse();
}
