import type { Editor, MarkdownPostProcessorContext } from "obsidian";
import { MarkdownView, Notice, Plugin } from "obsidian";
import { DEFAULT_SETTINGS, VizardrySettingTab } from "./settings";
import type { PluginSettings } from "./settings";
import { initLinearService, getLinearService } from "./linear";
import type { CacheEntry } from "./linear/types";
import { enrichLinearKeys } from "./shared/linear-enrichment";
import { initUpvotyService, getUpvotyService, destroyUpvotyService } from "./upvoty";
import { enrichUpvotyKeys } from "./shared/upvoty-enrichment";
import { triggerRelink } from "./renderer/canvas";
import { resetInteractiveIdCounter } from "./renderer/controls";
import { setPluginVersion } from "./shared/version";
import { generateCanvasTemplate } from "./templates";
import type { FrameworkOption } from "./modal";
import { CanvasInsertModal } from "./modal";
import { CUSTOM_RENDERERS, EXTRA_OPTIONS } from "./processors";
import { ALL_FRAMEWORKS } from "./frameworks/registry";
import { dispatchVizardry } from "./vizardry-dispatch";
import { insertTemplateAtCursor } from "./shared/editor";
import { t, tFrameworkDescription } from "./i18n";

export default class VizardryPlugin extends Plugin {
  settings: PluginSettings = DEFAULT_SETTINGS;

  async saveSettings(): Promise<void> {
    const existing = ((await this.loadData()) ?? {}) as Record<string, unknown>;
    // Preserve linearCache alongside settings
    await this.saveData({ ...existing, ...this.settings });
  }

  async onload(): Promise<void> {
    const rawData = ((await this.loadData()) ?? {}) as Record<string, unknown>;
    this.settings = { ...DEFAULT_SETTINGS, ...rawData } as PluginSettings;
    initLinearService(this as Parameters<typeof initLinearService>[0]);
    const linearCache = rawData.linearCache as Record<string, CacheEntry> | undefined;
    if (linearCache) getLinearService()?.cache.init(linearCache);
    initUpvotyService(this as Parameters<typeof initUpvotyService>[0]);
    this.addSettingTab(new VizardrySettingTab(this.app, this));
    // Expose version on body for bug reports (manual devtools inspection).
    document.body.dataset.vizardryVersion = this.manifest.version;
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

    // ── Heading change listener ────────────────────────────────────────
    // When any file's metadata (headings) changes, refresh link buttons on
    // all currently rendered canvas blocks belonging to that file.
    // Debounced per file: rapid edits (e.g. typing in a heading) coalesce
    // into a single relink pass fired 200 ms after the last change.
    const relinkTimers = new Map<string, ReturnType<typeof setTimeout>>();
    this.registerEvent(
      this.app.metadataCache.on("changed", (file) => {
        const prev = relinkTimers.get(file.path);
        if (prev !== undefined) clearTimeout(prev);
        relinkTimers.set(file.path, setTimeout(() => {
          relinkTimers.delete(file.path);
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
      if (getLinearService()?.isEnabled()) enrichLinearKeys(el);
    }, 1000);

    // ── Global Upvoty key enrichment ───────────────────────────────────
    this.registerMarkdownPostProcessor((el) => {
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

  onunload(): void {
    resetInteractiveIdCounter();
    initLinearService(null);
    destroyUpvotyService();
  }
}
