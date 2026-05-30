import { Notice } from "obsidian";
import type { App, MarkdownPostProcessorContext } from "obsidian";
import { writeBlockContent } from "../shared/block-edit";
import { t } from "../i18n";

export function renderBlockBody(body: HTMLElement, content: string): void {
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
      body.createEl("div", { cls: "vzd-block-line", text: line });
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
): void {
  // Prevent re-entrancy
  if (body.hasClass("vzd-block-editing")) return;
  body.addClass("vzd-block-editing");
  body.removeClass("vizardry-block-empty");
  body.empty();

  const textarea = body.createEl("textarea", { cls: "vzd-block-textarea" });
  textarea.value = currentContent.trim();

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
      renderBlockBody(body, currentContent);
      return;
    }

    // Optimistically re-render so the canvas updates immediately before
    // Obsidian triggers a full re-render from the source change.
    renderBlockBody(body, newValue.trim());
  };

  textarea.addEventListener("blur", commit);
  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      committed = true;
      body.removeClass("vzd-block-editing");
      renderBlockBody(body, currentContent);
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
