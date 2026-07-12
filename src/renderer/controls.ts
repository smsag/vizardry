import { setIcon, MarkdownView } from "obsidian";
import type { App, MarkdownPostProcessorContext } from "obsidian";
import { applyFullWidth } from "./full-width";
import { onDisconnected, ownerWindow } from "../shared/lifecycle";
import { t } from "../i18n";
import { TITLE_MAX_LENGTH } from "../shared/title-edit";
import { getPluginVersion } from "../shared/version";
import type { LinkResolver } from "../shared/links";
import { attachSectionPreview } from "./section-preview";
import { writeCollapseState } from "../shared/block-edit";

let nextId = 0;

export function markInteractive(el: HTMLElement): void {
  el.dataset.vzdId = String(nextId++);
}

/**
 * If `label` resolves to a heading in the current note, appends a chain-link
 * button to `parent` that jumps to it. Shared by the card canvases (card
 * blocks, Story, SCQA grid) so a linked card gets the same affordance the grid
 * boxes, roadmap cards, and tree nodes already have. No-op when unresolved.
 */
export function renderHeadingLink(
  parent: HTMLElement,
  label: string,
  resolver: LinkResolver | undefined,
  navigateTo: ((heading: string) => void) | undefined,
  app?: App,
  sourcePath?: string,
): void {
  const heading = resolver?.resolve(label);
  if (!heading || !navigateTo) return;

  const linkBtn = parent.createEl("button", { cls: "vzd-card-link-btn vzd-btn" });
  setIcon(linkBtn, "link");
  linkBtn.setAttribute("aria-label", t("nav.jumpTo", { heading }));
  linkBtn.dataset.heading = heading;
  markInteractive(linkBtn);
  linkBtn.addEventListener("click", (e) => { e.stopPropagation(); navigateTo(heading); });

  // Cmd/Ctrl-hover (desktop) or long-press (mobile) shows a clipped preview of
  // the linked section on the whole box/card.
  if (app && sourcePath) attachSectionPreview(app, parent, heading, sourcePath);
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
  extraHeaderContent?: (header: HTMLElement) => void,
  source?: string,
  onTitleEdit?: (newTitle: string) => void,
  app?: App,
  ctx?: MarkdownPostProcessorContext,
): void {
  container.addClass("vizardry-canvas");
  container.setAttribute("data-framework", frameworkId);
  // Store the raw source so resolveEditor can locate this block by content
  // scan when ctx.getSectionInfo() returns null (e.g. in Live Preview mode).
  // Without this, inline edits fail to save in Live Edit ("Edit could not be
  // saved — open the note in editing mode").
  if (source !== undefined) container.dataset.vzSource = source;
  container.style.width = "100%";
  container.style.minWidth = "100%";
  container.style.boxSizing = "border-box";
  ownerWindow(container).requestAnimationFrame(() => applyFullWidth(container));

  // Restore collapsed state from source (written back by the minimize button).
  const isCollapsed = source !== undefined &&
    source.split("\n").some(l => l.trim().toLowerCase() === "collapsed: true");
  if (isCollapsed) container.addClass("vizardry-canvas--minimized");

  const header = container.createEl("div", { cls: "vizardry-header" });

  if (onTitleEdit) {
    renderEditableTitle(header, title, onTitleEdit);
  } else {
    header.createEl("span", { text: title, cls: "vizardry-title" });
  }

  // Every canvas is authored under the single ```vizardry fence now (the
  // `type:` line inside `source` identifies the framework), regardless of
  // what `frameworkId` is used for elsewhere (data-framework, diagnostics).
  const fence = '```';
  const copyText = source !== undefined
    ? fence + 'vizardry' + '\n' + source + '\n' + fence
    : undefined;
  addHeaderControls(header, container, title, copyText, app, ctx, isCollapsed);
  extraHeaderContent?.(header);
}

function renderEditableTitle(header: HTMLElement, title: string, onTitleEdit: (newTitle: string) => void): void {
  const span = header.createEl("span", { text: title, cls: "vizardry-title vizardry-title--editable" });
  span.setAttribute("title", t("title.clickToEdit"));

  span.addEventListener("click", (e) => {
    e.stopPropagation();
    if (span.classList.contains("vizardry-title--editing")) return;

    span.classList.add("vizardry-title--editing");
    span.setAttribute("contenteditable", "true");
    span.setAttribute("spellcheck", "false");
    span.focus();

    // Place cursor at end
    const range = span.ownerDocument.createRange();
    range.selectNodeContents(span);
    range.collapse(false);
    const sel = ownerWindow(span).getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);

    const commit = (): void => {
      if (!span.classList.contains("vizardry-title--editing")) return;
      span.classList.remove("vizardry-title--editing");
      span.removeAttribute("contenteditable");
      span.removeAttribute("spellcheck");
      span.removeEventListener("keydown", onKeyDown);

      const newTitle = (span.textContent ?? "").trim().slice(0, TITLE_MAX_LENGTH) || title;
      span.textContent = newTitle;
      onTitleEdit(newTitle);
    };

    const cancel = (): void => {
      if (!span.classList.contains("vizardry-title--editing")) return;
      span.classList.remove("vizardry-title--editing");
      span.removeAttribute("contenteditable");
      span.removeAttribute("spellcheck");
      span.removeEventListener("keydown", onKeyDown);
      span.textContent = title;
    };

    const onKeyDown = (ev: KeyboardEvent): void => {
      if (ev.key === "Enter") { ev.preventDefault(); commit(); }
      if (ev.key === "Escape") { ev.preventDefault(); cancel(); }
    };

    span.addEventListener("keydown", onKeyDown);
    span.addEventListener("blur", commit, { once: true });
  });
}

export function addHeaderControls(
  header: HTMLElement,
  container: HTMLElement,
  title: string,
  copyText?: string,
  app?: App,
  ctx?: MarkdownPostProcessorContext,
  initiallyCollapsed = false,
): void {
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

  const editSourceBtn = actions.createEl("button", { cls: "vizardry-edit-source-btn vzd-btn" }) as HTMLButtonElement;
  setIcon(editSourceBtn, "code");
  editSourceBtn.setAttribute("aria-label", t("controls.editSource"));
  editSourceBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    // In Live Preview the canvas lives inside a .cm-embed-block wrapper that
    // has a native "Edit block" button — delegate to that to avoid
    // re-implementing the CM6 toggle.
    const embedBlock = container.closest(".cm-embed-block");
    const nativeBtn = embedBlock?.querySelector<HTMLElement>(".edit-block-button");
    if (nativeBtn) {
      nativeBtn.click();
    } else if (app) {
      // In Read mode there is no CM6 embed wrapper. Switch to Live Preview so
      // the user lands in the editable view with the code block visible.
      const view = app.workspace.getActiveViewOfType(MarkdownView);
      if (view) void view.setState({ ...view.getState(), mode: "source" }, { history: false });
    }
  });

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
      // Derive doc/window from the container itself — it may live in a
      // pop-out Obsidian window, which has its own theme styles and DPI.
      const doc = container.ownerDocument;
      const win = doc.defaultView ?? window;
      const bg = win.getComputedStyle(doc.body).getPropertyValue("--background-primary").trim() || "#ffffff";
      const dataUrl = await toPng(container, {
        pixelRatio: win.devicePixelRatio * 2,
        backgroundColor: bg,
        filter: (node) => !(node as HTMLElement).classList?.contains("vizardry-header-actions"),
      });
      const a = doc.createElement("a");
      a.href = dataUrl;
      a.download = `${title}.png`;
      a.click();
    } catch (err) {
      console.error(`Vizardry v${getPluginVersion()}: PNG export failed`, err);
    } finally {
      downloadBtn.disabled = false;
    }
  };

  downloadBtn.addEventListener("click", (e) => { e.stopPropagation(); void handleDownload(); });
  if (copyText !== undefined) {
    const copyBtn = actions.createEl("button", { cls: "vizardry-copy-btn vzd-btn" }) as HTMLButtonElement;
    setIcon(copyBtn, "copy");
    copyBtn.setAttribute("aria-label", t("controls.copySource"));
    copyBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      void navigator.clipboard.writeText(copyText).then(() => {
        setIcon(copyBtn, "check");
        setTimeout(() => setIcon(copyBtn, "copy"), 1000);
      }).catch(err => {
        console.error(`Vizardry v${getPluginVersion()}: copy failed`, err);
      });
    });
  }

  const presentBtn = actions.createEl("button", { cls: "vizardry-present-btn vzd-btn" });
  setIcon(presentBtn, "expand");
  presentBtn.setAttribute("aria-label", t("controls.presentFullscreen"));
  presentBtn.addEventListener("click", (e) => { e.stopPropagation(); openPresentation(container, title); });

  // Separator + minimize button — always last in the action bar
  actions.createEl("span", { cls: "vzd-btn-separator" });

  let collapsed = initiallyCollapsed;
  const minimizeBtn = actions.createEl("button", { cls: "vzd-minimize-btn vzd-btn" });
  setIcon(minimizeBtn, collapsed ? "chevron-down" : "chevron-up");
  minimizeBtn.setAttribute("aria-label", t(collapsed ? "controls.expand" : "controls.minimize"));
  minimizeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    collapsed = !collapsed;
    container.toggleClass("vizardry-canvas--minimized", collapsed);
    setIcon(minimizeBtn, collapsed ? "chevron-down" : "chevron-up");
    minimizeBtn.setAttribute("aria-label", t(collapsed ? "controls.expand" : "controls.minimize"));
    if (app && ctx) writeCollapseState(app, ctx, container, collapsed);
  });
}

function openPresentation(sourceContainer: HTMLElement, title: string): void {
  // Use the source container's own document — it may live in a pop-out
  // Obsidian window, and the overlay must render there, not in the main window.
  const doc = sourceContainer.ownerDocument;
  const overlay = doc.body.createEl("div", { cls: "vzd-presentation-overlay" });

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
      ".vizardry-grid, .vzd-story-grid, .vzd-venn-wrap, .vizardry-ost-wrapper, .vizardry-mindmap-wrapper, .vizardry-impact-wrapper, .vizardry-fishbone-wrapper, .vzd-sipoc-wrap, .vzd-sipoc-flow-wrap, .vzd-wardley-wrap, .vzd-roadmap-grid, .vzd-pl-stack, .vzd-matrix-wrap, .vzd-scqa-scroll, .vizardry-scqa-wrapper, .vzd-journey-grid"
    );
    if (!contentEl) return;

    const clone = contentEl.cloneNode(true) as HTMLElement;

    // Restore mobile carousel state — show all blocks
    clone.querySelectorAll(".vizardry-block").forEach(b => b.classList.add("vizardry-block-active"));
    clone.querySelectorAll(".vzd-pl-row").forEach(r => r.classList.add("vzd-pl-row--active"));

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

    // Restore journey phase carousel state — show full grid
    if (clone.classList.contains("vzd-journey-grid")) {
      clone.style.gridTemplateColumns = "";
      clone.querySelectorAll<HTMLElement>(".vzd-journey-lane-cells").forEach(el => {
        el.style.gridTemplateColumns = "";
      });
      clone.querySelectorAll<HTMLElement>(".vzd-journey-phase-header, .vzd-journey-cell").forEach(el => {
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
    doc.removeEventListener("keydown", onKeyDown);
  };

  closeBtn.addEventListener("click", dismiss);

  const onKeyDown = (e: KeyboardEvent): void => { if (e.key === "Escape") dismiss(); };
  doc.addEventListener("keydown", onKeyDown);

  // Guard: if the overlay is removed from the DOM without dismiss() being
  // called (e.g. a plugin reload), clean up the document-level listener so it
  // doesn't accumulate across reloads.
  onDisconnected(overlay, () => {
    doc.removeEventListener("keydown", onKeyDown);
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
      sourceContainer.querySelector<HTMLElement>(`[data-vzd-id="${CSS.escape(id)}"]`)?.click();
    });
  });
}
