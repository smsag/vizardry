import { setIcon } from "obsidian";
import type { App, MarkdownPostProcessorContext } from "obsidian";
import type { FrameworkDefinition } from "../types";
import { initCanvas, markInteractive } from "./controls";
import { renderBlockBody, activateBlockEdit } from "./block-editor";
import { setupMobileCarousel } from "./grid-carousel";
import { t } from "../i18n";
import type { LinkResolver } from "../shared/links";

export function renderError(message: string, container: HTMLElement): void {
  container.addClass("vizardry-error");
  container.createEl("span", { cls: "vizardry-error-icon", text: "⚠" });
  container.createEl("span", { cls: "vizardry-error-message", text: message });
}

export function renderCanvas(
  framework: FrameworkDefinition,
  data: Record<string, string>,
  container: HTMLElement,
  resolver: LinkResolver,
  navigateTo: (heading: string) => void,
  app?: App,
  ctx?: MarkdownPostProcessorContext,
): void {
  initCanvas(container, framework.id, framework.label);

  const grid = container.createEl("div", { cls: "vizardry-grid" });
  grid.style.setProperty("--vzd-template", framework.gridTemplate);
  grid.style.setProperty("--vzd-columns", framework.gridColumns);
  grid.style.setProperty("--vzd-rows", framework.gridRows);

  for (const blockDef of framework.blocks) {
    const labelKey = blockDef.label.toLowerCase();
    const block = grid.createEl("div", { cls: "vizardry-block" });
    block.style.gridArea = blockDef.area;
    block.setAttribute("data-area", blockDef.area);

    const labelRow = block.createEl("div", { cls: "vizardry-block-label-row" });
    labelRow.createEl("span", { text: blockDef.label, cls: "vizardry-block-label" });

    const heading = resolver.resolve(labelKey);
    if (heading) {
      const linkBtn = labelRow.createEl("button", { cls: "vizardry-block-link-btn vzd-btn" });
      setIcon(linkBtn, "link");
      linkBtn.setAttribute("aria-label", t("nav.jumpTo", { heading }));
      linkBtn.dataset.heading = heading;
      markInteractive(linkBtn);
      linkBtn.addEventListener("click", (e) => { e.stopPropagation(); navigateTo(heading); });
    }

    const content = data[labelKey] ?? "";
    const body = block.createEl("div", { cls: "vizardry-block-body" });

    renderBlockBody(body, content);

    if (app && ctx) {
      body.addClass("vzd-block-editable");
      body.setAttribute("title", t("edit.clickToEdit"));
      body.dataset.blockContent = content;
      body.addEventListener("click", () => {
        activateBlockEdit(body, blockDef.label, body.dataset.blockContent ?? "", app, ctx, container);
      });
    }
  }

  setupMobileCarousel(container, framework.blocks.length);
}
