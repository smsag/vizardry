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
import { paginatePrepared, prepareDocument, printNote } from "./export";

export class PrintExportModal extends Modal {
  private plugin: VizardryPlugin;
  private file: TFile | null;
  private options: PrintOptions;
  private ctx: PrintContext;
  private previewEl!: HTMLElement;
  private templateOptionsEl!: HTMLElement;
  private tplDescEl!: HTMLElement;
  private pageInfoEl!: HTMLElement;
  /** The note rendered once, reused for every preview re-pagination. */
  private prepared: PreparedDoc | null = null;
  /** Removes the head `<style>` nodes from the most recent preview pagination. */
  private clearPreviewStyles: (() => void) | null = null;
  private closed = false;
  private previewTimer: ReturnType<typeof setTimeout> | null = null;
  /** Serialises preview renders so two paginations never overlap. */
  private previewChain: Promise<void> = Promise.resolve();
  /** Watches the open note so an external edit refreshes the cached render. */
  private modifyRef: EventRef | null = null;
  private invalidateTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(app: App, plugin: VizardryPlugin) {
    super(app);
    this.plugin = plugin;
    this.file = app.workspace.getActiveFile();
    this.options = normalizePrintOptions(plugin.settings.printOptions);
    this.ctx = { app };
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
    this.schedulePreview(true);
  }

  onClose(): void {
    this.closed = true;
    if (this.previewTimer) clearTimeout(this.previewTimer);
    if (this.invalidateTimer) clearTimeout(this.invalidateTimer);
    if (this.modifyRef) this.app.vault.offref(this.modifyRef);
    this.modifyRef = null;
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
        this.schedulePreview();
      }, 500);
    });
  }

  // ── Persisting + reacting to a changed option ────────────────────────────────

  private commit(rerenderTemplateOptions = false): void {
    this.plugin.settings.printOptions = this.options;
    void this.plugin.saveSettings();
    if (rerenderTemplateOptions) this.renderTemplateOptions();
    this.schedulePreview();
  }

  // ── Controls ─────────────────────────────────────────────────────────────────

  private buildControls(root: HTMLElement): void {
    // Template picker
    new Setting(root)
      .setName(t("print.opt.template"))
      .addDropdown((drop) => {
        for (const tpl of BUILTIN_PRINT_TEMPLATES) drop.addOption(tpl.id, tpl.name);
        drop.setValue(this.options.templateId).onChange((v) => {
          this.options.templateId = v;
          // Reset per-template values — a new template declares its own options.
          this.options.templateValues = {};
          this.tplDescEl.setText(getPrintTemplate(v).description);
          this.commit(true);
        });
      });

    // Template description — kept in sync by the picker's onChange above.
    this.tplDescEl = root.createEl("p", {
      text: getPrintTemplate(this.options.templateId).description,
      cls: "vzd-print-tpl-desc",
    });

    // Page size
    new Setting(root).setName(t("print.opt.pageSize")).addDropdown((drop) => {
      const sizes: PageSize[] = ["A4", "A5", "Letter", "Legal"];
      for (const s of sizes) drop.addOption(s, s);
      drop.setValue(this.options.pageSize).onChange((v) => {
        this.options.pageSize = v as PageSize;
        this.commit();
      });
    });

    // Orientation
    new Setting(root).setName(t("print.opt.landscape")).addToggle((tg) =>
      tg.setValue(this.options.landscape).onChange((v) => {
        this.options.landscape = v;
        this.commit();
      }),
    );

    // Margins
    new Setting(root).setName(t("print.opt.margins")).addDropdown((drop) => {
      const presets: { value: MarginPreset; label: string }[] = [
        { value: "narrow", label: t("print.margins.narrow") },
        { value: "normal", label: t("print.margins.normal") },
        { value: "wide", label: t("print.margins.wide") },
      ];
      for (const p of presets) drop.addOption(p.value, p.label);
      drop.setValue(this.options.margins).onChange((v) => {
        this.options.margins = v as MarginPreset;
        this.commit();
      });
    });

    // Start H1 on a new page
    new Setting(root)
      .setName(t("print.opt.h1Break"))
      .setDesc(t("print.opt.h1BreakDesc"))
      .addToggle((tg) =>
        tg.setValue(this.options.h1PageBreak).onChange((v) => {
          this.options.h1PageBreak = v;
          this.commit();
        }),
      );

    // Start H2 on a new page
    new Setting(root).setName(t("print.opt.h2Break")).addToggle((tg) =>
      tg.setValue(this.options.h2PageBreak).onChange((v) => {
        this.options.h2PageBreak = v;
        this.commit();
      }),
    );

    // Page numbers
    new Setting(root).setName(t("print.opt.pageNumbers")).addDropdown((drop) => {
      const formats: { value: PageNumberFormat; label: string }[] = [
        { value: "none", label: t("print.pageNumbers.none") },
        { value: "plain", label: t("print.pageNumbers.plain") },
        { value: "page-n", label: t("print.pageNumbers.pageN") },
        { value: "n-of-total", label: t("print.pageNumbers.nOfTotal") },
      ];
      for (const f of formats) drop.addOption(f.value, f.label);
      drop.setValue(this.options.pageNumbers).onChange((v) => {
        this.options.pageNumbers = v as PageNumberFormat;
        this.commit();
      });
    });

    // Page-number position
    new Setting(root).setName(t("print.opt.pageNumberPosition")).addDropdown((drop) => {
      const positions: { value: PageNumberPosition; label: string }[] = [
        { value: "bottom-center", label: t("print.position.bottomCenter") },
        { value: "bottom-right", label: t("print.position.bottomRight") },
        { value: "bottom-left", label: t("print.position.bottomLeft") },
        { value: "top-right", label: t("print.position.topRight") },
        { value: "top-center", label: t("print.position.topCenter") },
      ];
      for (const p of positions) drop.addOption(p.value, p.label);
      drop.setValue(this.options.pageNumberPosition).onChange((v) => {
        this.options.pageNumberPosition = v as PageNumberPosition;
        this.commit();
      });
    });

    // Running header (note title)
    new Setting(root)
      .setName(t("print.opt.runningHeader"))
      .setDesc(t("print.opt.runningHeaderDesc"))
      .addToggle((tg) =>
        tg.setValue(this.options.runningHeader).onChange((v) => {
          this.options.runningHeader = v;
          this.commit();
        }),
      );

    // Per-template declared options
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
      if (opt.type === "toggle") {
        const current = (this.options.templateValues[opt.id] as boolean | undefined) ?? opt.default;
        setting.addToggle((tg) =>
          tg.setValue(current).onChange((v) => {
            this.options.templateValues[opt.id] = v;
            this.commit();
          }),
        );
      } else if (opt.type === "select") {
        const current = (this.options.templateValues[opt.id] as string | undefined) ?? opt.default;
        setting.addDropdown((drop) => {
          for (const c of opt.choices) drop.addOption(c.value, c.label);
          drop.setValue(current).onChange((v) => {
            this.options.templateValues[opt.id] = v;
            this.commit();
          });
        });
      } else {
        // color
        const current = (this.options.templateValues[opt.id] as string | undefined) ?? opt.default;
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
   * Debounce a preview refresh. Rapid option changes collapse to a single
   * render, and each render is chained onto the previous one so two Paged.js
   * paginations never run concurrently (they share the document head and the
   * preview container). Pass `immediate` for the first render on open.
   */
  private schedulePreview(immediate = false): void {
    if (this.previewTimer) clearTimeout(this.previewTimer);
    const enqueue = (): void => {
      this.previewTimer = null;
      this.previewChain = this.previewChain.catch(() => {}).then(() => this.runPreview());
    };
    if (immediate) enqueue();
    else this.previewTimer = setTimeout(enqueue, 250);
  }

  /**
   * Re-paginate the note into the preview pane. Only ever runs one at a time.
   * The expensive markdown render happens once (cached in `this.prepared`);
   * subsequent option changes only re-run Paged.js on a clone of it.
   */
  private async runPreview(): Promise<void> {
    if (this.closed || !this.file) return;
    const file = this.file;
    // Snapshot the options: paginate reads them after async work, so a later
    // toggle must not bleed into this render.
    const opts: PrintOptions = {
      ...this.options,
      templateValues: { ...this.options.templateValues },
    };
    this.previewEl.addClass("is-loading");
    try {
      if (!this.prepared) this.prepared = await prepareDocument(this.ctx, file);
      if (this.closed) return;
      // Drop the previous pagination's pages and its head stylesheets before
      // laying out the new one.
      this.clearPreviewStyles?.();
      this.clearPreviewStyles = null;
      this.previewEl.empty();
      const { removeStyles, pageCount } = await paginatePrepared(this.prepared, opts, this.previewEl);
      if (this.closed) {
        removeStyles();
        return;
      }
      this.clearPreviewStyles = removeStyles;
      this.setPageInfo(pageCount);
    } catch (err) {
      console.error("Vizardry: preview render failed", err);
      if (!this.closed) {
        this.previewEl.empty();
        this.previewEl.createEl("p", { text: t("print.previewFailed"), cls: "vzd-print-empty" });
        this.setPageInfo(null);
      }
    } finally {
      if (!this.closed) this.previewEl.removeClass("is-loading");
    }
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

  // ── Footer ───────────────────────────────────────────────────────────────────

  private buildFooter(root: HTMLElement): void {
    const footer = root.createDiv({ cls: "vzd-print-footer" });
    // Left: live page count. Right: the action buttons.
    this.pageInfoEl = footer.createEl("span", { cls: "vzd-print-pageinfo" });
    const actions = footer.createDiv({ cls: "vzd-print-actions" });
    const cancel = actions.createEl("button", { text: t("print.cancel") });
    cancel.addEventListener("click", () => this.close());

    const print = actions.createEl("button", { text: t("print.print"), cls: "mod-cta" });
    print.addEventListener("click", () => {
      if (!this.file) return;
      const file = this.file;
      const options = this.options;
      // Any preview pagination already in flight must finish before we start
      // the print one — the two share the document head, and overlapping runs
      // would cross-attribute the injected stylesheets. close() stops further
      // preview renders; awaiting the chain drains the in-flight one.
      const pending = this.previewChain;
      // Tear down the modal first so its preview DOM isn't caught in the print
      // portal, then hand off to the system dialog.
      this.close();
      void pending
        .catch(() => {})
        .then(() => printNote(this.ctx, file, options))
        .catch((err) => {
          console.error("Vizardry: print failed", err);
          new Notice(t("print.notice.failed"));
        });
    });
  }
}
