import { setIcon } from "obsidian";
import { applyFullWidth } from "./full-width";
import { onDisconnected } from "../shared/lifecycle";
import { t } from "../i18n";

let nextId = 0;

export function markInteractive(el: HTMLElement): void {
  el.dataset.vzdId = String(nextId++);
}

/**
 * Reset the interactive-element ID counter.
 * Must be called from VizardryPlugin.onunload() so that a plugin reload
 * (e.g. via Hot Reload) starts fresh — otherwise presentation-mode click
 * rebinding silently fails because the new canvas IDs do not match the
 * IDs already burned into the cloned DOM from the previous load.
 */
export function resetInteractiveIdCounter(): void {
  nextId = 0;
}

export function initCanvas(
  container: HTMLElement,
  frameworkId: string,
  title: string,
  extraHeaderContent?: (header: HTMLElement) => void
): void {
  container.addClass("vizardry-canvas");
  container.setAttribute("data-framework", frameworkId);
  container.style.width = "100%";
  container.style.minWidth = "100%";
  container.style.boxSizing = "border-box";
  requestAnimationFrame(() => applyFullWidth(container));

  const header = container.createEl("div", { cls: "vizardry-header" });
  header.createEl("span", { text: title, cls: "vizardry-title" });
  extraHeaderContent?.(header);
  addHeaderControls(header, container, title);
}

export function addHeaderControls(header: HTMLElement, container: HTMLElement, title: string): void {
  const actions = header.createEl("div", { cls: "vizardry-header-actions" });

  const STEP_PX = 2, MIN_STEP = -3, MAX_STEP = 6;
  let step = 0;

  const decreaseBtn = actions.createEl("button", { cls: "vizardry-font-btn vzd-btn" }) as HTMLButtonElement;
  setIcon(decreaseBtn, "minus");
  decreaseBtn.setAttribute("aria-label", t("controls.decreaseFontSize"));

  const increaseBtn = actions.createEl("button", { cls: "vizardry-font-btn vzd-btn" }) as HTMLButtonElement;
  setIcon(increaseBtn, "plus");
  increaseBtn.setAttribute("aria-label", t("controls.increaseFontSize"));

  const applyStep = (): void => {
    if (step === 0) {
      container.style.removeProperty("--vzd-base");
    } else {
      container.style.setProperty("--vzd-base", `calc(var(--vzd-base-default) + ${step * STEP_PX}px)`);
    }
    decreaseBtn.disabled = step <= MIN_STEP;
    increaseBtn.disabled = step >= MAX_STEP;
  };

  decreaseBtn.addEventListener("click", (e) => { e.stopPropagation(); if (step > MIN_STEP) { step--; applyStep(); } });
  increaseBtn.addEventListener("click", (e) => { e.stopPropagation(); if (step < MAX_STEP) { step++; applyStep(); } });
  applyStep();

  const downloadBtn = actions.createEl("button", { cls: "vizardry-download-btn vzd-btn" }) as HTMLButtonElement;
  setIcon(downloadBtn, "download");
  downloadBtn.setAttribute("aria-label", t("controls.downloadPng"));

  const handleDownload = async (): Promise<void> => {
    downloadBtn.disabled = true;
    try {
      // Lazy-load html-to-image so its initialisation cost is deferred to the
      // first click rather than paid at plugin startup. esbuild's CJS __commonJS
      // factory means the module code runs on first require(), not at bundle eval.
      const { toPng } = await import("html-to-image");
      const bg = getComputedStyle(document.body).getPropertyValue("--background-primary").trim() || "#ffffff";
      const dataUrl = await toPng(container, {
        pixelRatio: window.devicePixelRatio * 2,
        backgroundColor: bg,
        filter: (node) => !(node as HTMLElement).classList?.contains("vizardry-header-actions"),
      });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `${title}.png`;
      a.click();
    } catch (err) {
      const v = (document.body.dataset.vizardryVersion ?? "?");
      console.error(`Vizardry v${v}: PNG export failed`, err);
    } finally {
      downloadBtn.disabled = false;
    }
  };

  downloadBtn.addEventListener("click", (e) => { e.stopPropagation(); void handleDownload(); });

  const presentBtn = actions.createEl("button", { cls: "vizardry-present-btn vzd-btn" });
  setIcon(presentBtn, "expand");
  presentBtn.setAttribute("aria-label", t("controls.presentFullscreen"));
  presentBtn.addEventListener("click", (e) => { e.stopPropagation(); openPresentation(container, title); });
}

function openPresentation(sourceContainer: HTMLElement, title: string): void {
  const overlay = document.body.createEl("div", { cls: "vzd-presentation-overlay" });

  const pHeader = overlay.createEl("div", { cls: "vzd-presentation-header" });
  pHeader.createEl("span", { text: title, cls: "vzd-presentation-title" });
  const btnGroup = pHeader.createEl("div", { cls: "vzd-presentation-btn-group" });

  const reloadBtn = btnGroup.createEl("button", { cls: "vzd-presentation-reload vzd-btn" });
  setIcon(reloadBtn, "refresh-cw");
  reloadBtn.setAttribute("aria-label", t("controls.reloadCanvas"));

  const closeBtn = btnGroup.createEl("button", { cls: "vzd-presentation-close vzd-btn" });
  setIcon(closeBtn, "x");
  closeBtn.setAttribute("aria-label", t("controls.exitPresentation"));

  const wrap = overlay.createEl("div", { cls: "vzd-presentation-wrap" });

  const loadContent = (): void => {
    wrap.empty();
    // Covers all canvas types: grid, story, venn, ost, mindmap, impact
    const contentEl = sourceContainer.querySelector<HTMLElement>(
      ".vizardry-grid, .vzd-story-grid, .vzd-venn-wrap, .vizardry-ost-wrapper, .vizardry-mindmap-wrapper, .vizardry-impact-wrapper, .vzd-sipoc-wrap, .vzd-sipoc-flow-wrap, .vzd-wardley-wrap"
    );
    if (!contentEl) return;

    const clone = contentEl.cloneNode(true) as HTMLElement;

    // Restore mobile carousel state — show all blocks
    clone.querySelectorAll(".vizardry-block").forEach(b => b.classList.add("vizardry-block-active"));

    // Restore story step carousel state — show full grid
    if (clone.classList.contains("vzd-story-grid")) {
      clone.style.gridTemplateColumns = "";
      clone.querySelectorAll<HTMLElement>(".vzd-story-activity-header").forEach(el => {
        el.style.display = "";
        el.style.gridColumn = el.dataset.origGridCol ?? "";
      });
      clone.querySelectorAll<HTMLElement>(".vzd-story-step-header, .vzd-story-cell").forEach(el => {
        el.style.display = "";
        el.style.gridColumn = "";
      });
    }

    rebindPresentationInteractions(clone, sourceContainer);
    wrap.appendChild(clone);
  };

  loadContent();

  reloadBtn.addEventListener("click", () => {
    reloadBtn.addClass("vzd-presentation-reload--spinning");
    loadContent();
    setTimeout(() => reloadBtn.removeClass("vzd-presentation-reload--spinning"), 400);
  });

  const dismiss = (): void => {
    overlay.remove();
    document.removeEventListener("keydown", onKeyDown);
  };

  closeBtn.addEventListener("click", dismiss);

  const onKeyDown = (e: KeyboardEvent): void => { if (e.key === "Escape") dismiss(); };
  document.addEventListener("keydown", onKeyDown);

  // Guard: if the overlay is removed from the DOM without dismiss() being
  // called (e.g. a plugin reload), clean up the document-level listener so it
  // doesn't accumulate across reloads.
  onDisconnected(overlay, () => {
    document.removeEventListener("keydown", onKeyDown);
  });

  let touchStartY = 0;
  overlay.addEventListener("touchstart", (e) => { touchStartY = e.touches[0].clientY; }, { passive: true });
  overlay.addEventListener("touchend", (e) => {
    if (e.changedTouches[0].clientY - touchStartY > 80) dismiss();
  }, { passive: true });
}

// Each interactive element is assigned a stable data-vzd-id at render time via
// markInteractive(). The clone delegates clicks back to the source by ID,
// firing the original handler without any structural DOM inference.
function rebindPresentationInteractions(cloneRoot: HTMLElement, sourceContainer: HTMLElement): void {
  cloneRoot.querySelectorAll<HTMLElement>("[data-vzd-id]").forEach(cloneEl => {
    const id = cloneEl.dataset.vzdId!;
    cloneEl.addEventListener("click", (e) => {
      e.stopPropagation();
      sourceContainer.querySelector<HTMLElement>(`[data-vzd-id="${id}"]`)?.click();
    });
  });
}
