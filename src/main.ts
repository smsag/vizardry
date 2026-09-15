import type { Editor, MarkdownPostProcessorContext } from "obsidian";
import { addIcon, MarkdownView, Notice, Plugin } from "obsidian";
import { VizardrySettingTab } from "./settings";
import { normalizeSettings, serializeSettings } from "./settings-schema";
import type { PluginSettings } from "./settings-schema";
import { initLinearService, getLinearService, destroyLinearService } from "./linear";
import { enrichLinearKeys } from "./shared/linear-enrichment";
import { initUpvotyService, getUpvotyService, destroyUpvotyService } from "./upvoty";
import { enrichUpvotyKeys } from "./shared/upvoty-enrichment";
import { triggerRelink } from "./renderer/canvas";
import { resetInteractiveIdCounter } from "./renderer/controls";
import { closeSectionPreview } from "./renderer/section-preview";
import { resetKeyOpenState } from "./shared/key-open-state";
import { initSideleaf, revealSideleaf } from "./sideleaf";
import { VIZARDRY_VIEW_TYPE } from "./sideleaf/view-type";
import { VIZARDRY_ICON_ID, VIZARDRY_ICON_SVG } from "./sideleaf/icon";
import { VizardrySideleafView } from "./sideleaf/view";
import { setPluginVersion } from "./shared/version";
import { ensureSketchDefs, removeSketchDefs } from "./shared/sketch-defs";
import { CanvasInsertModal } from "./modal";
import { createApi, VIZARDRY_NO_ENRICH_CLASS } from "./renderer/export-api";
import type { VizardryApi } from "./renderer/export-api";
import { getInsertOptions } from "./catalog";
import { dispatchVizardry } from "./vizardry-dispatch";
import { insertTemplateAtCursor } from "./shared/editor";
import { VizardryHeadingSuggest } from "./heading-suggest";
import { updatePersistedData } from "./shared/persisted-data";
import { t } from "./i18n";

export default class VizardryPlugin extends Plugin {
  // A fresh normalized object, never the shared frozen DEFAULT_SETTINGS —
  // the settings tab mutates this in place.
  override settings: PluginSettings = normalizeSettings({});
  // Per-file debounce timers for the heading-change relink pass. An instance
  // field (not a local in onload()) so onunload() can cancel any still
  // pending when the plugin is disabled/reloaded — otherwise a timer
  // scheduled just before unload would still fire afterwards and touch
  // module-level relink state from a torn-down plugin instance.
  private relinkTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /**
   * Public API for other plugins — see src/renderer/export-api.ts. Set early in
   * onload() and cleared in onunload() so a caller holding a stale plugin
   * reference cannot capture through a torn-down instance.
   */
  api: VizardryApi | null = null;

  async saveSettings(): Promise<void> {
    // Routed through updatePersistedData so this can't race LinearCache's or
    // UpvotyCache's own read-modify-write persist() calls and clobber them
    // (or be clobbered by them) — see shared/persisted-data.ts.
    //
    // Only schema keys are merged in (serializeSettings), never the whole
    // settings object: data.json also holds the two cache blobs, and writing
    // back a snapshot of those taken at onload would discard every summary
    // cached since — see settings-schema.ts.
    //
    // A failed write (read-only vault, full disk) is reported once to the
    // user rather than as an unhandled rejection in a settings callback:
    // otherwise settings simply "don't stick" with nothing to explain why.
    try {
      await updatePersistedData(this, (existing) => ({ ...existing, ...serializeSettings(this.settings) }));
    } catch (err) {
      console.error("Vizardry: could not save settings", err);
      if (!this.saveFailureShown) {
        this.saveFailureShown = true;
        new Notice(t("notices.settingsSaveFailed"));
      }
    }
  }

  /** The save-failure Notice is shown once per session, not per keystroke. */
  private saveFailureShown = false;

  override async onload(): Promise<void> {
    const rawData = ((await this.loadData()) ?? {}) as Record<string, unknown>;
    // Coerced and clamped rather than spread: data.json is user-editable and
    // also carries the cache blobs, neither of which belong in settings.
    this.settings = normalizeSettings(rawData);
    // `init` validates the blob itself (a malformed or non-object value is
    // dropped), so no cast or shape check is needed here.
    // Both before the services, so a leaf restored from workspace.json
    // (Obsidian rebuilds sidebar views during layout-ready) finds its view
    // type known and its icon already registered.
    addIcon(VIZARDRY_ICON_ID, VIZARDRY_ICON_SVG);
    this.registerView(VIZARDRY_VIEW_TYPE, (leaf) => new VizardrySideleafView(leaf));
    initSideleaf(this.app);
    initLinearService(this as Parameters<typeof initLinearService>[0]);
    getLinearService()?.cache.init(rawData.linearCache);
    initUpvotyService(this as Parameters<typeof initUpvotyService>[0]);
    getUpvotyService()?.cache.init(rawData.upvotyCache);
    // Before any registration that could fail: the export API depends on nothing
    // else being wired up, and a caller's fallback shouldn't hinge on whether an
    // unrelated processor registered.
    this.api = createApi();
    this.addSettingTab(new VizardrySettingTab(this.app, this));
    // Expose version on body for bug reports (manual devtools inspection).
    document.body.dataset.vizardryVersion = this.manifest.version;
    this.applySketchMode();
    // Re-apply sketch styling (body class + the SVG filter defs the sketch CSS
    // references) to each pop-out window as it opens — a url(#…) filter only
    // resolves against defs in the same document.
    this.registerEvent(
      this.app.workspace.on("window-open", (_wsWin, win) => this.applySketchToDoc(win.document)),
    );
    // Also keep a window-independent copy for renderer error attribution —
    // the dataset above only lives on the main window's document.
    setPluginVersion(this.manifest.version);

    const tag = `Vizardry v${this.manifest.version}`;

    // ── Single unified code-block language ──────────────────────────────
    // Every canvas (grid frameworks and bespoke renderers alike) is
    // dispatched from here based on the block's own `type:` line — see
    // src/vizardry-dispatch.ts for the "type: <id>[, <variant>]" syntax.
    try {
      this.registerMarkdownCodeBlockProcessor("vizardry", (source, el, ctx: MarkdownPostProcessorContext) => {
        dispatchVizardry(source, el, ctx, this.app);
      });
    } catch (err) {
      console.error(`${tag}: failed to register the "vizardry" processor`, err);
    }

    // ── Heading autocomplete inside vizardry blocks ────────────────────
    // Obsidian's native [[ suggester still triggers inside a fenced code
    // block but silently fails to insert — this offers a working [[#Heading]]
    // completion scoped to vizardry fences. See heading-suggest.ts.
    this.registerEditorSuggest(new VizardryHeadingSuggest(this.app));

    // ── Heading change listener ────────────────────────────────────────
    // When any file's metadata (headings) changes, refresh link buttons on
    // all currently rendered canvas blocks belonging to that file.
    // Debounced per file: rapid edits (e.g. typing in a heading) coalesce
    // into a single relink pass fired 200 ms after the last change.
    this.registerEvent(
      this.app.metadataCache.on("changed", (file) => {
        const prev = this.relinkTimers.get(file.path);
        if (prev !== undefined) clearTimeout(prev);
        this.relinkTimers.set(file.path, setTimeout(() => {
          this.relinkTimers.delete(file.path);
          triggerRelink(file.path);
        }, 200));
      }),
    );

    // ── Global Linear key enrichment ──────────────────────────────────
    // Runs after all code-block processors so vizardry canvases are already
    // rendered when this post-processor scans for Linear keys.
    // Sort order 1000 ensures this runs after all code-block processors (sort 0),
    // so vizardry canvases are fully rendered before we scan for Linear keys.
    this.registerMarkdownPostProcessor((el) => {
      // Skip any host another plugin marked with the opt-out class: keys render
      // as plain text, with no badges, popovers, summaries, or enrichment
      // network calls. This is the only point at which that can be decided — by
      // the time a canvas is exported, the requests would already have been made.
      if (el.closest(`.${VIZARDRY_NO_ENRICH_CLASS}`)) return;
      if (getLinearService()?.isEnabled()) enrichLinearKeys(el);
    }, 1000);

    // ── Global Upvoty key enrichment ───────────────────────────────────
    this.registerMarkdownPostProcessor((el) => {
      if (el.closest(`.${VIZARDRY_NO_ENRICH_CLASS}`)) return;
      if (getUpvotyService()?.isEnabled()) enrichUpvotyKeys(el);
    }, 1001);

    // ── Framework options (modal + commands) ───────────────────────────
    // One list built from the catalog — grid frameworks, custom renderers and
    // modal-only presets alike, with ids already checked for collisions so two
    // entries can never claim the same `insert-<id>` command.
    const frameworkOptions = getInsertOptions();

    const withActiveMarkdownEditor = (run: (editor: Editor) => void): void => {
      const view = this.app.workspace.getActiveViewOfType(MarkdownView);
      const editor = view?.editor;
      if (!editor) {
        new Notice(t("notices.openMarkdownNote"));
        return;
      }
      run(editor);
    };

    // ── Command: open the sideleaf ─────────────────────────────────────
    // Key clicks reveal it on their own; this is for opening it empty, or
    // getting back to it after the sidebar was collapsed.
    this.addCommand({
      id: "open-sideleaf",
      name: t("sideleaf.openCommand"),
      callback: () => { void revealSideleaf(); },
    });

    // ── Ribbon icon → opens insert modal ──────────────────────────────
    this.addRibbonIcon("layout-template", t("commands.insertVizardryCanvas"), () => {
      withActiveMarkdownEditor((editor) => new CanvasInsertModal(this.app, editor, frameworkOptions).open());
    });

    // ── Command: fuzzy modal ───────────────────────────────────────────
    this.addCommand({
      id: "insert-canvas",
      name: t("commands.insertCanvas"),
      callback: () => withActiveMarkdownEditor((editor) => {
        new CanvasInsertModal(this.app, editor, frameworkOptions).open();
      }),
    });

    // ── Commands: one per framework ────────────────────────────────────
    for (const option of frameworkOptions) {
      this.addCommand({
        id: `insert-${option.id}`,
        name: t("commands.insertFramework", { label: option.label }),
        callback: () => withActiveMarkdownEditor((editor) => {
          insertTemplateAtCursor(editor, option.template);
        }),
      });
    }
  }

  /**
   * Sketch (hand-drawn) mode is a global body class + an optional font-family
   * override, both read live by the sketch rules in styles.css — so toggling it
   * restyles every already-rendered canvas instantly, no re-render needed.
   */
  /** Every document currently hosting the workspace: the main one plus any pop-outs. */
  private sketchDocuments(): Document[] {
    const docs = new Set<Document>([document]);
    this.app.workspace.iterateAllLeaves((leaf) => {
      const doc = leaf.view?.containerEl?.ownerDocument;
      if (doc) docs.add(doc);
    });
    return Array.from(docs);
  }

  /** Apply the sketch body class, font override, and filter defs to one document. */
  applySketchToDoc(doc: Document): void {
    doc.body.toggleClass("vizardry-sketch", this.settings.sketchMode);
    const font = this.settings.sketchFont.trim();
    if (font) doc.body.style.setProperty("--vzd-sketch-font-override", font);
    else doc.body.style.removeProperty("--vzd-sketch-font-override");
    ensureSketchDefs(doc);
  }

  applySketchMode(): void {
    for (const doc of this.sketchDocuments()) this.applySketchToDoc(doc);
  }

  override onunload(): void {
    this.api = null;
    delete document.body.dataset.vizardryVersion;
    for (const timer of this.relinkTimers.values()) clearTimeout(timer);
    this.relinkTimers.clear();
    closeSectionPreview();
    // The sideleaf's own cards are left alone: Obsidian keeps the leaf across
    // a plugin reload, and a card is the user's to close. Only the badge
    // registry is dropped, since every badge in the DOM is about to go.
    resetKeyOpenState();
    initSideleaf(null);
    resetInteractiveIdCounter();
    destroyLinearService();
    destroyUpvotyService();
    for (const doc of this.sketchDocuments()) {
      doc.body.removeClass("vizardry-sketch");
      doc.body.style.removeProperty("--vzd-sketch-font-override");
      removeSketchDefs(doc);
    }
  }
}

