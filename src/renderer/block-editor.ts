import { Notice } from "obsidian";
import type { App, MarkdownPostProcessorContext } from "obsidian";
import { writeBlockContent } from "../shared/block-edit";
import { renderInline } from "../shared/inline-markdown";
import { renderHeadingLink } from "./controls";
import type { LinkResolver } from "../shared/links";
import { t } from "../i18n";

export function renderBlockBody(
  body: HTMLElement,
  content: string,
  resolver?: LinkResolver,
  navigateTo?: (heading: string) => void,
  app?: App,
  sourcePath?: string,
): void {
  body.empty();
  // Keep dataset in sync so the click handler always has the latest content.
  body.dataset.blockContent = content;
  if (content.trim() === "") {
    body.addClass("vizardry-block-empty");
    body.removeClass("vzd-block-body--filled");
  } else {
    body.removeClass("vizardry-block-empty");
    body.addClass("vzd-block-body--filled");
    content.split("\n").forEach(line => {
      const lineEl = body.createEl("div", { cls: "vzd-block-line" });
      renderInline(lineEl, line);
      renderHeadingLink(lineEl, line, resolver, navigateTo, app, sourcePath);
    });
  }
}

export function activateBlockEdit(
  body: HTMLElement,
  blockLabel: string,
  currentContent: string,
  app: App,
  ctx: MarkdownPostProcessorContext,
  container: HTMLElement,
  resolver?: LinkResolver,
  navigateTo?: (heading: string) => void,
): void {
  // Prevent re-entrancy
  if (body.hasClass("vzd-block-editing")) return;

  // Capture height before emptying so the textarea seeds to the same size,
  // preventing the block from snapping to a different height when editing starts.
  const preEditHeight = body.offsetHeight;

  body.addClass("vzd-block-editing");
  body.removeClass("vizardry-block-empty");
  body.empty();

  const textarea = body.createEl("textarea", { cls: "vzd-plain-textarea vzd-block-textarea" });
  textarea.value = currentContent.trim();
  if (preEditHeight > 0) textarea.style.minHeight = `${preEditHeight}px`;

  // Auto-size height to content
  const resize = (): void => {
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  };
  resize();
  textarea.addEventListener("input", resize);

  // Focus and place cursor at end
  textarea.focus();
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);

  let committed = false;

  const commit = (): void => {
    if (committed) return;
    committed = true;

    const newValue = textarea.value;
    const written = writeBlockContent(app, ctx, container, blockLabel, newValue);

    body.removeClass("vzd-block-editing");

    if (!written) {
      new Notice(t("edit.writeFailed"));
      renderBlockBody(body, currentContent, resolver, navigateTo, app, ctx.sourcePath);
      return;
    }

    // Optimistically re-render so the canvas updates immediately before
    // Obsidian triggers a full re-render from the source change.
    renderBlockBody(body, newValue.trim(), resolver, navigateTo, app, ctx.sourcePath);
  };

  textarea.addEventListener("blur", commit);
  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      committed = true;
      body.removeClass("vzd-block-editing");
      renderBlockBody(body, currentContent, resolver, navigateTo, app, ctx.sourcePath);
    }
    // Allow Tab to insert spaces rather than moving focus
    if (e.key === "Tab") {
      e.preventDefault();
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      textarea.value = textarea.value.slice(0, start) + "  " + textarea.value.slice(end);
      textarea.selectionStart = textarea.selectionEnd = start + 2;
      resize();
    }
  });
}
