import { Lexer, Parser, type Token, type Tokens } from "marked";
import { dispatchVizardry } from "../src/vizardry-dispatch";

export function renderDocument(
  markdown: string,
  container: HTMLElement,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx: any,
): void {
  const tokens = Lexer.lex(markdown);
  let proseBuf: Token[] = [];

  const flushProse = (): void => {
    if (proseBuf.length === 0) return;
    const html = Parser.parse(proseBuf as unknown as Token[] & { links: Record<string, { href: string; title: string }> });
    const prose = container.createEl("div", { cls: "vzd-ext-prose" });
    prose.innerHTML = html;
    proseBuf = [];
  };

  for (const token of tokens) {
    if (token.type === "code" && (token as Tokens.Code).lang === "vizardry") {
      flushProse();
      const host = container.createEl("div", { cls: "vzd-ext-canvas-host" });
      try {
        dispatchVizardry((token as Tokens.Code).text, host, ctx, app);
      } catch (err) {
        host.createEl("pre", {
          cls: "vzd-ext-error",
          text: `Render error: ${(err as Error).message}`,
        });
      }
    } else {
      proseBuf.push(token);
    }
  }

  flushProse();
}
