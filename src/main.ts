import type { Editor, MarkdownPostProcessorContext } from "obsidian";
import { MarkdownView, Notice, Plugin } from "obsidian";
import { DEFAULT_SETTINGS, VizardrySettingTab } from "./settings";
import type { PluginSettings } from "./settings";
import { initLinearService, getLinearService } from "./linear";
import type { CacheEntry } from "./linear/types";
import { enrichLinearKeys } from "./shared/linear-enrichment";
import { initUpvotyService, getUpvotyService, destroyUpvotyService } from "./upvoty";
import type { UpvotyCacheEntry } from "./upvoty/types";
import { enrichUpvotyKeys } from "./shared/upvoty-enrichment";
import { triggerRelink } from "./renderer/canvas";
import { resetInteractiveIdCounter } from "./renderer/controls";
import { closeSectionPreview } from "./renderer/section-preview";
import { closeAllKeyPopovers } from "./shared/key-enrichment";
import { setPluginVersion } from "./shared/version";
import { generateCanvasTemplate } from "./templates";
import type { FrameworkOption } from "./modal";
import { CanvasInsertModal } from "./modal";
import { PrintExportModal } from "./print/modal";
import { PRINT_SCRATCH_CLASS } from "./print/export";
import { CUSTOM_RENDERERS, EXTRA_OPTIONS } from "./processors";
import { ALL_FRAMEWORKS } from "./frameworks-registry";
import { dispatchVizardry } from "./vizardry-dispatch";
import { insertTemplateAtCursor } from "./shared/editor";
import { VizardryHeadingSuggest } from "./heading-suggest";
import { updatePersistedData } from "./shared/persisted-data";
import { t, tFrameworkDescription } from "./i18n";

export default class VizardryPlugin extends Plugin {
  settings: PluginSettings = DEFAULT_SETTINGS;
  // Per-file debounce timers for the heading-change relink pass. An instance
  // field (not a local in onload()) so onunload() can cancel any still
  // pending when the plugin is disabled/reloaded — otherwise a timer
  // scheduled just before unload would still fire afterwards and touch
  // module-level relink state from a torn-down plugin instance.
  private relinkTimers = new Map<string, ReturnType<typeof setTimeout>>();

  async saveSettings(): Promise<void> {
    // Routed through updatePersistedData so this can't race LinearCache's or
    // UpvotyCache's own read-modify-write persist() calls and clobber them
    // (or be clobbered by them) — see shared/persisted-data.ts.
    await updatePersistedData(this, (existing) => ({ ...existing, ...this.settings }));
  }

  async onload(): Promise<void> {
    const rawData = ((await this.loadData()) ?? {}) as Record<string, unknown>;
    this.settings = { ...DEFAULT_SETTINGS, ...rawData } as PluginSettings;
    initLinearService(this as Parameters<typeof initLinearService>[0]);
    const linearCache = rawData.linearCache as Record<string, CacheEntry> | undefined;
    if (linearCache) getLinearService()?.cache.init(linearCache);
    initUpvotyService(this as Parameters<typeof initUpvotyService>[0]);
    const upvotyCache = rawData.upvotyCache as Record<string, UpvotyCacheEntry> | undefined;
    if (upvotyCache) getUpvotyService()?.cache.init(upvotyCache);
    this.addSettingTab(new VizardrySettingTab(this.app, this));
    // Expose version on body for bug reports (manual devtools inspection).
    document.body.dataset.vizardryVersion = this.manifest.version;
    ensureSketchDefs();
    this.applySketchMode();
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
      // Skip the offscreen print render: keys print as plain text, with no
      // badges, popovers, summaries, or enrichment network calls.
      if (el.closest(`.${PRINT_SCRATCH_CLASS}`)) return;
      if (getLinearService()?.isEnabled()) enrichLinearKeys(el);
    }, 1000);

    // ── Global Upvoty key enrichment ───────────────────────────────────
    this.registerMarkdownPostProcessor((el) => {
      if (el.closest(`.${PRINT_SCRATCH_CLASS}`)) return;
      if (getUpvotyService()?.isEnabled()) enrichUpvotyKeys(el);
    }, 1001);

    // ── Framework options (modal + commands) ───────────────────────────
    const frameworkOptions: FrameworkOption[] = [
      ...ALL_FRAMEWORKS.map(def => ({
        id: def.id,
        label: def.label,
        template: generateCanvasTemplate(def),
        description: tFrameworkDescription(def.id),
      })),
      ...CUSTOM_RENDERERS.map(r => ({
        id: r.id,
        label: r.label,
        template: r.template,
        description: tFrameworkDescription(r.id),
      })),
      ...EXTRA_OPTIONS.map(o => ({
        id: o.id,
        label: o.label,
        template: o.template,
        description: tFrameworkDescription(o.id),
      })),
    ];

    const withActiveMarkdownEditor = (run: (editor: Editor) => void): void => {
      const view = this.app.workspace.getActiveViewOfType(MarkdownView);
      const editor = view?.editor;
      if (!editor) {
        new Notice(t("notices.openMarkdownNote"));
        return;
      }
      run(editor);
    };

    // ── Ribbon icon → opens insert modal ──────────────────────────────
    this.addRibbonIcon("layout-template", t("commands.insertVizardryCanvas"), () => {
      const view = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (!view) return;
      new CanvasInsertModal(this.app, view.editor, frameworkOptions).open();
    });

    // ── Command: fuzzy modal ───────────────────────────────────────────
    this.addCommand({
      id: "insert-canvas",
      name: t("commands.insertCanvas"),
      callback: () => withActiveMarkdownEditor((editor) => {
        new CanvasInsertModal(this.app, editor, frameworkOptions).open();
      }),
    });

    // ── Command: export / print the active note ────────────────────────
    // Opens Vizardry's own print dialog (template + page-layout settings),
    // renders the note with all canvases/Mermaid, paginates via Paged.js and
    // hands off to the system print dialog. See src/print/.
    this.addCommand({
      id: "export-print-note",
      name: t("commands.exportPrint"),
      checkCallback: (checking: boolean) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== "md") return false;
        if (!checking) new PrintExportModal(this.app, this).open();
        return true;
      },
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
  applySketchMode(): void {
    document.body.toggleClass("vizardry-sketch", this.settings.sketchMode);
    const font = this.settings.sketchFont.trim();
    if (font) document.body.style.setProperty("--vzd-sketch-font-override", font);
    else document.body.style.removeProperty("--vzd-sketch-font-override");
  }

  onunload(): void {
    for (const timer of this.relinkTimers.values()) clearTimeout(timer);
    this.relinkTimers.clear();
    closeSectionPreview();
    closeAllKeyPopovers();
    resetInteractiveIdCounter();
    initLinearService(null);
    destroyUpvotyService();
    document.body.removeClass("vizardry-sketch");
    document.body.style.removeProperty("--vzd-sketch-font-override");
    document.getElementById("vzd-sketch-defs")?.remove();
  }
}

/**
 * Injects the shared SVG <filter> that gives sketch-mode canvases their
 * hand-drawn line wobble (feTurbulence → feDisplacementMap). Referenced by id
 * from the sketch CSS (`filter: url(#vzd-sketch-rough)`); harmless when sketch
 * mode is off since nothing references it. Injected once into the main document.
 */
function ensureSketchDefs(): void {
  if (document.getElementById("vzd-sketch-defs")) return;
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("id", "vzd-sketch-defs");
  svg.setAttribute("width", "0");
  svg.setAttribute("height", "0");
  svg.setAttribute("aria-hidden", "true");
  svg.style.position = "absolute";
  const filter = document.createElementNS(NS, "filter");
  filter.setAttribute("id", "vzd-sketch-rough");
  const turb = document.createElementNS(NS, "feTurbulence");
  turb.setAttribute("type", "fractalNoise");
  turb.setAttribute("baseFrequency", "0.02");
  turb.setAttribute("numOctaves", "2");
  turb.setAttribute("seed", "7");
  turb.setAttribute("result", "noise");
  const disp = document.createElementNS(NS, "feDisplacementMap");
  disp.setAttribute("in", "SourceGraphic");
  disp.setAttribute("in2", "noise");
  disp.setAttribute("scale", "1.1");
  disp.setAttribute("xChannelSelector", "R");
  disp.setAttribute("yChannelSelector", "G");
  filter.appendChild(turb);
  filter.appendChild(disp);
  svg.appendChild(filter);
  document.body.appendChild(svg);
}
