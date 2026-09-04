/**
 * The export dialog — Vizardry's own "print dialog", so that templates and
 * layout settings (page size, margins, start-H1-on-new-page, page numbers…)
 * live in one place rather than the browser's print chrome.
 *
 * Left column: the controls. Right column: a live Paged.js preview of the
 * actual paginated output. The footer prints via the system dialog.
 */

import type { App, EventRef, TFile } from "obsidian";
import { Modal, Notice, Setting } from "obsidian";
import type VizardryPlugin from "../main";
import { t } from "../i18n";
import type {
  MarginPreset,
  PageNumberFormat,
  PageNumberPosition,
  PageSize,
  PrintOptions,
} from "./options";
import { normalizePrintOptions } from "./options";
import { BUILTIN_PRINT_TEMPLATES, getPrintTemplate } from "./templates";
import type { PreparedDoc, PrintContext } from "./export";
import { buildDocCss, paginateCss, prepareDocument, printNote } from "./export";
import { SerialScheduler } from "./preview-scheduler";

/** A choice for a dropdown control. */
interface Choice<T extends string> {
  value: T;
  label: string;
}

export class PrintExportModal extends Modal {
  private plugin: VizardryPlugin;
  private file: TFile | null;
  private options: PrintOptions;
  private ctx: PrintContext;
  private previewEl!: HTMLElement;
  private templateOptionsEl!: HTMLElement;
  private tplDescEl!: HTMLElement;
  private pageInfoEl!: HTMLElement;
  private printBtn!: HTMLButtonElement;

  /** The note rendered once, reused for every preview re-pagination. */
  private prepared: PreparedDoc | null = null;
  /** Removes the head `<style>` nodes from the most recent preview pagination. */
  private clearPreviewStyles: (() => void) | null = null;
  /** The stylesheet the current preview was paginated with — memo to skip no-ops. */
  private lastPrintCss: string | null = null;
  /** True once a preview with ≥1 page has rendered — gates the Print action. */
  private canPrint = false;
  private closed = false;

  /** Debounced + serialised preview renders (see SerialScheduler). */
  private readonly preview = new SerialScheduler(() => this.runPreview(), 250);
  /** Watches the open note so an external edit refreshes the cached render. */
  private modifyRef: EventRef | null = null;
  private invalidateTimer: ReturnType<typeof setTimeout> | null = null;
  /** Debounced settings persist so dragging a control doesn't thrash data.json. */
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private settingsDirty = false;

  constructor(app: App, plugin: VizardryPlugin) {
    super(app);
    this.plugin = plugin;
    this.file = app.workspace.getActiveFile();
    this.options = normalizePrintOptions(plugin.settings.printOptions);
    this.ctx = { app, pluginDir: plugin.manifest.dir };
  }

  onOpen(): void {
    const { contentEl, modalEl } = this;
    modalEl.addClass("vzd-print-modal");
    contentEl.empty();
    contentEl.createEl("h2", { text: t("print.title") });

    if (!this.file) {
      contentEl.createEl("p", { text: t("print.noFile"), cls: "vzd-print-empty" });
      return;
    }

    const layout = contentEl.createDiv({ cls: "vzd-print-layout" });
    const controls = layout.createDiv({ cls: "vzd-print-controls" });
    this.previewEl = layout.createDiv({ cls: "vzd-print-preview" });

    this.buildControls(controls);
    this.buildFooter(contentEl);
    this.watchFile();
    // Enter prints — but let a focused control (dropdown, colour input, a
    // button) handle its own Enter first. Listener dies with the modal element.
    this.modalEl.addEventListener("keydown", (evt) => {
      if (evt.key !== "Enter") return;
      const el = document.activeElement;
      if (
        el instanceof HTMLSelectElement ||
        el instanceof HTMLInputElement ||
        el instanceof HTMLButtonElement
      ) {
        return;
      }
      evt.preventDefault();
      this.triggerPrint();
    });
    this.preview.schedule(true);
  }

  onClose(): void {
    this.closed = true;
    this.preview.dispose();
    if (this.invalidateTimer) clearTimeout(this.invalidateTimer);
    if (this.modifyRef) this.app.vault.offref(this.modifyRef);
    this.modifyRef = null;
    this.flushSave();
    this.clearPreviewStyles?.();
    this.clearPreviewStyles = null;
    this.prepared?.destroy();
    this.prepared = null;
    this.contentEl.empty();
  }

  /**
   * Drop the cached render and rebuild the preview when the open note is edited
   * elsewhere. Debounced so a burst of keystrokes in another pane coalesces
   * into one rebuild rather than thrashing the (expensive) markdown render.
   */
  private watchFile(): void {
    this.modifyRef = this.app.vault.on("modify", (changed) => {
      if (!this.file || changed.path !== this.file.path) return;
      if (this.invalidateTimer) clearTimeout(this.invalidateTimer);
      this.invalidateTimer = setTimeout(() => {
        this.prepared?.destroy();
        this.prepared = null;
        this.lastPrintCss = null; // content changed — force a re-paginate
        this.preview.schedule();
      }, 500);
    });
  }

  // ── Persisting + reacting to a changed option ────────────────────────────────

  private commit(rerenderTemplateOptions = false): void {
    this.plugin.settings.printOptions = this.options;
    this.persistSoon();
    if (rerenderTemplateOptions) this.renderTemplateOptions();
    this.preview.schedule();
  }

  private persistSoon(): void {
    this.settingsDirty = true;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flushSave(), 400);
  }

  private flushSave(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (!this.settingsDirty) return;
    this.settingsDirty = false;
    void this.plugin.saveSettings();
  }

  // ── Controls ─────────────────────────────────────────────────────────────────

  /** One dropdown row wired to a typed getter/setter. Centralises the cast. */
  private dropdownRow<T extends string>(
    root: HTMLElement,
    name: string,
    choices: Choice<T>[],
    get: () => T,
    set: (v: T) => void,
    desc?: string,
  ): void {
    const setting = new Setting(root).setName(name);
    if (desc) setting.setDesc(desc);
    setting.addDropdown((drop) => {
      for (const c of choices) drop.addOption(c.value, c.label);
      drop.setValue(get()).onChange((v) => {
        set(v as T);
        this.commit();
      });
    });
  }

  /** One toggle row wired to a typed getter/setter. */
  private toggleRow(
    root: HTMLElement,
    name: string,
    get: () => boolean,
    set: (v: boolean) => void,
    desc?: string,
  ): void {
    const setting = new Setting(root).setName(name);
    if (desc) setting.setDesc(desc);
    setting.addToggle((tg) =>
      tg.setValue(get()).onChange((v) => {
        set(v);
        this.commit();
      }),
    );
  }

  private buildControls(root: HTMLElement): void {
    const o = this.options;

    // Template picker (special: resets per-template values + updates the blurb).
    new Setting(root).setName(t("print.opt.template")).addDropdown((drop) => {
      for (const tpl of BUILTIN_PRINT_TEMPLATES) drop.addOption(tpl.id, tpl.name);
      drop.setValue(o.templateId).onChange((v) => {
        o.templateId = v;
        o.templateValues = {};
        this.tplDescEl.setText(getPrintTemplate(v).description);
        this.commit(true);
      });
    });
    this.tplDescEl = root.createEl("p", {
      text: getPrintTemplate(o.templateId).description,
      cls: "vzd-print-tpl-desc",
    });

    const sizes: Choice<PageSize>[] = ["A4", "A5", "Letter", "Legal"].map((s) => ({
      value: s as PageSize,
      label: s,
    }));
    this.dropdownRow(root, t("print.opt.pageSize"), sizes, () => o.pageSize, (v) => (o.pageSize = v));

    this.toggleRow(root, t("print.opt.landscape"), () => o.landscape, (v) => (o.landscape = v));

    this.dropdownRow<MarginPreset>(
      root,
      t("print.opt.margins"),
      [
        { value: "narrow", label: t("print.margins.narrow") },
        { value: "normal", label: t("print.margins.normal") },
        { value: "wide", label: t("print.margins.wide") },
      ],
      () => o.margins,
      (v) => (o.margins = v),
    );

    this.toggleRow(root, t("print.opt.showTitle"), () => o.showTitle, (v) => (o.showTitle = v));

    this.toggleRow(
      root,
      t("print.opt.h1Break"),
      () => o.h1PageBreak,
      (v) => (o.h1PageBreak = v),
      t("print.opt.h1BreakDesc"),
    );
    this.toggleRow(root, t("print.opt.h2Break"), () => o.h2PageBreak, (v) => (o.h2PageBreak = v));

    this.dropdownRow<PageNumberFormat>(
      root,
      t("print.opt.pageNumbers"),
      [
        { value: "none", label: t("print.pageNumbers.none") },
        { value: "plain", label: t("print.pageNumbers.plain") },
        { value: "page-n", label: t("print.pageNumbers.pageN") },
        { value: "n-of-total", label: t("print.pageNumbers.nOfTotal") },
      ],
      () => o.pageNumbers,
      (v) => (o.pageNumbers = v),
    );

    this.dropdownRow<PageNumberPosition>(
      root,
      t("print.opt.pageNumberPosition"),
      [
        { value: "bottom-center", label: t("print.position.bottomCenter") },
        { value: "bottom-right", label: t("print.position.bottomRight") },
        { value: "bottom-left", label: t("print.position.bottomLeft") },
        { value: "top-right", label: t("print.position.topRight") },
        { value: "top-center", label: t("print.position.topCenter") },
      ],
      () => o.pageNumberPosition,
      (v) => (o.pageNumberPosition = v),
    );

    this.toggleRow(
      root,
      t("print.opt.runningHeader"),
      () => o.runningHeader,
      (v) => (o.runningHeader = v),
      t("print.opt.runningHeaderDesc"),
    );

    // Per-template declared options.
    this.templateOptionsEl = root.createDiv({ cls: "vzd-print-template-options" });
    this.renderTemplateOptions();
  }

  /** (Re)render the controls contributed by the currently chosen template. */
  private renderTemplateOptions(): void {
    const host = this.templateOptionsEl;
    host.empty();
    const template = getPrintTemplate(this.options.templateId);
    if (!template.options?.length) return;

    host.createEl("h4", { text: t("print.templateOptions") });
    for (const opt of template.options) {
      const setting = new Setting(host).setName(opt.label);
      const current = (this.options.templateValues[opt.id] as string | undefined) ?? opt.default;
      if (opt.type === "select") {
        setting.addDropdown((drop) => {
          for (const c of opt.choices) drop.addOption(c.value, c.label);
          drop.setValue(current).onChange((v) => {
            this.options.templateValues[opt.id] = v;
            this.commit();
          });
        });
      } else {
        setting.addColorPicker((cp) =>
          cp.setValue(current).onChange((v) => {
            this.options.templateValues[opt.id] = v;
            this.commit();
          }),
        );
      }
    }
  }

  // ── Preview ──────────────────────────────────────────────────────────────────

  /**
   * Re-paginate the note into the preview pane. Only ever runs one at a time
   * (serialised by the scheduler). The expensive markdown render happens once
   * (cached in `this.prepared`); an option change only re-runs Paged.js on a
   * clone of it — and is skipped entirely when the stylesheet is unchanged.
   */
  private async runPreview(): Promise<void> {
    if (this.closed || !this.file) return;
    const file = this.file;
    // Snapshot the values the async work depends on.
    const opts: PrintOptions = {
      ...this.options,
      templateValues: { ...this.options.templateValues },
    };
    this.previewEl.addClass("is-loading");
    try {
      if (!this.prepared) this.prepared = await prepareDocument(this.ctx, file);
      if (this.closed) return;

      const css = buildDocCss(this.prepared, opts);
      // Nothing that affects layout changed and a preview is already up — skip.
      if (css === this.lastPrintCss && this.clearPreviewStyles) return;

      this.clearPreviewStyles?.();
      this.clearPreviewStyles = null;
      this.previewEl.empty();
      const { removeStyles, pageCount } = await paginateCss(this.prepared, css, this.previewEl);
      if (this.closed) {
        removeStyles();
        return;
      }
      this.clearPreviewStyles = removeStyles;
      this.lastPrintCss = css;
      this.fitPreview();
      this.setPageInfo(pageCount);
      this.setCanPrint(pageCount > 0);
    } catch (err) {
      console.error("Vizardry: preview render failed", err);
      if (!this.closed) {
        this.previewEl.empty();
        this.previewEl.createEl("p", { text: t("print.previewFailed"), cls: "vzd-print-empty" });
        this.lastPrintCss = null;
        this.setPageInfo(null);
        this.setCanPrint(false);
      }
    } finally {
      if (!this.closed) this.previewEl.removeClass("is-loading");
    }
  }

  /**
   * Scale the paginated pages to fit the preview pane's width, whatever the
   * chosen page size. Uses `offsetWidth`/`offsetHeight` (unaffected by the CSS
   * transform) to measure the true sheet, then feeds the scale and the height
   * to shave back into the flow to CSS variables.
   */
  private fitPreview(): void {
    const page = this.previewEl.querySelector<HTMLElement>(".pagedjs_page");
    if (!page) return;
    const available = this.previewEl.clientWidth - 24; // padding allowance
    const width = page.offsetWidth;
    if (available <= 0 || width <= 0) return;
    const scale = Math.min(1, available / width);
    this.previewEl.style.setProperty("--vzd-preview-scale", String(scale));
    this.previewEl.style.setProperty("--vzd-preview-shave", `${Math.round(page.offsetHeight * (1 - scale))}px`);
  }

  /** Update the footer page-count label (blank when there's nothing to show). */
  private setPageInfo(pageCount: number | null): void {
    if (!this.pageInfoEl) return;
    this.pageInfoEl.setText(
      pageCount === null
        ? ""
        : pageCount === 1
          ? t("print.pageCountOne")
          : t("print.pageCount", { n: pageCount }),
    );
  }

  private setCanPrint(can: boolean): void {
    this.canPrint = can;
    if (this.printBtn) this.printBtn.disabled = !can;
  }

  // ── Footer ───────────────────────────────────────────────────────────────────

  private buildFooter(root: HTMLElement): void {
    const footer = root.createDiv({ cls: "vzd-print-footer" });
    // Left: live page count. Right: the action buttons.
    this.pageInfoEl = footer.createEl("span", { cls: "vzd-print-pageinfo" });
    const actions = footer.createDiv({ cls: "vzd-print-actions" });
    const cancel = actions.createEl("button", { text: t("print.cancel") });
    cancel.addEventListener("click", () => this.close());

    this.printBtn = actions.createEl("button", { text: t("print.print"), cls: "mod-cta" });
    this.printBtn.disabled = true; // enabled once a preview with pages renders
    this.printBtn.addEventListener("click", () => this.triggerPrint());
  }

  private triggerPrint(): void {
    if (!this.file || !this.canPrint) return;
    const file = this.file;
    const options = this.options;
    // Any preview pagination already in flight must finish before we start the
    // print one — they share the document head, and overlapping runs would
    // cross-attribute the injected stylesheets. close() stops further preview
    // renders; awaiting the scheduler drains the in-flight one.
    const pending = this.preview.idle();
    // Tear down the modal first so its preview DOM isn't caught in the print
    // portal, then hand off to the system dialog.
    this.close();
    void pending
      .then(() => printNote(this.ctx, file, options))
      .catch((err) => {
        console.error("Vizardry: print failed", err);
        new Notice(t("print.notice.failed"));
      });
  }
}
