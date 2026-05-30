import type { App, Editor, MarkdownPostProcessorContext} from "obsidian";
import { MarkdownView, Notice, Plugin } from "obsidian";
import { parseFrameworkSource } from "./parser";
import { renderCanvas, renderError } from "./renderer";
import { resetInteractiveIdCounter } from "./renderer/controls";
import { generateCanvasTemplate } from "./templates";
import type { FrameworkOption } from "./modal";
import { CanvasInsertModal } from "./modal";
import { CUSTOM_RENDERERS, EXTRA_OPTIONS } from "./processors";
import type { ProcessorFn } from "./processors";
import { BMC } from "./frameworks/bmc";
import { LEAN } from "./frameworks/lean";
import { OPPORTUNITY } from "./frameworks/opportunity";
import { LEANUX } from "./frameworks/leanux";
import { VPC } from "./frameworks/vpc";
import { KATA } from "./frameworks/kata";
import { JOBS } from "./frameworks/jobs";
import { RAC } from "./frameworks/rac";
import { SWOT } from "./frameworks/swot";
import { FOURLS } from "./frameworks/fourls";
import type { FrameworkDefinition } from "./types";
import { insertTemplateAtCursor } from "./shared/editor";
import { t, tFrameworkDescription } from "./i18n";

// ── Grid-canvas framework registry ────────────────────────────────────────────
// The map is derived from the id field on each definition — no duplicate key.

const ALL_FRAMEWORKS: FrameworkDefinition[] = [
  BMC, FOURLS, LEAN, OPPORTUNITY, LEANUX, VPC, KATA, JOBS, RAC, SWOT,
];

const FRAMEWORKS = Object.fromEntries(ALL_FRAMEWORKS.map(f => [f.id, f]));

export default class VizardryPlugin extends Plugin {
  async onload(): Promise<void> {
    // Expose version on body for bug reports and renderer error attribution.
    document.body.dataset.vizardryVersion = this.manifest.version;

    const tag = `Vizardry v${this.manifest.version}`;

    const registerProcessor = (id: string, handler: ProcessorFn): void => {
      try {
        this.registerMarkdownCodeBlockProcessor(id, handler);
      } catch (err) {
        console.error(`${tag}: failed to register processor for "${id}"`, err);
      }
    };


    // Wraps a renderer call so any uncaught exception is surfaced as an
    // inline error banner rather than silently leaving the code block blank.
    const safeRender = (id: string, el: HTMLElement, fn: () => void): void => {
      try {
        fn();
      } catch (err) {
        console.error(`${tag}: renderer "${id}" threw`, err);
        renderError(`Renderer error — check the console (${tag})`, el);
      }
    };

    // ── Grid canvas renderers ──────────────────────────────────────────
    for (const [id, definition] of Object.entries(FRAMEWORKS)) {
      registerProcessor(id, (source, el, ctx) => {
        const result = parseFrameworkSource(source);
        if (!result.ok) { renderError(result.error, el); return; }
        safeRender(id, el, () => renderCanvas(definition, result.data, result.links, el, (heading) => {
          void this.app.workspace.openLinkText(`#${heading}`, ctx.sourcePath, false);
        }, this.app, ctx));
      });
    }

    // ── Custom renderers ───────────────────────────────────────────────
    for (const renderer of CUSTOM_RENDERERS) {
      const inner = renderer.createProcessor(this.app);
      registerProcessor(renderer.id, (source, el, ctx) => {
        safeRender(renderer.id, el, () => inner(source, el, ctx));
      });
    }

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
  }
}
