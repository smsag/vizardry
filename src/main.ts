import type { App, Editor, MarkdownPostProcessorContext} from "obsidian";
import { MarkdownView, Notice, Plugin } from "obsidian";
import { parseFrameworkSource } from "./parser";
import { parseImpactMap } from "./impact";
import { parseStoryMap } from "./story";
import { parseMindMap } from "./mindmap";
import { parseOST } from "./frameworks/ost";
import { parseVennDiagram } from "./venn";
import { parseWardleyMap } from "./wardley";
import { parseSIPOCFlow } from "./sipoc-flow";
import { renderCanvas, renderImpactMap, renderStoryMap, renderMindMap, renderOST, renderVennDiagram, renderSIPOC, renderSIPOCFlow, renderWardleyMap, renderError } from "./renderer";
import { generateCanvasTemplate, IMPACT_MAP_TEMPLATE, STORY_MAP_TEMPLATE, MIND_MAP_TEMPLATE, OST_TEMPLATE, VENN_TEMPLATE, CAROUSEL_TEMPLATE, SIPOC_TEMPLATE, SIPOC_FLOW_TEMPLATE, WARDLEY_TEMPLATE } from "./templates";
import type { FrameworkOption } from "./modal";
import { CanvasInsertModal } from "./modal";
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
import { parseCarouselBlock, renderCarouselBlock } from "./carousel";
import { parseSIPOC } from "./sipoc";
import { insertTemplateAtCursor } from "./shared/editor";
import { t, tFrameworkDescription } from "./i18n";

// ── Grid-canvas framework registry ────────────────────────────────────────────
// The map is derived from the id field on each definition — no duplicate key.

const ALL_FRAMEWORKS: FrameworkDefinition[] = [
  BMC, FOURLS, LEAN, OPPORTUNITY, LEANUX, VPC, KATA, JOBS, RAC, SWOT,
];

const FRAMEWORKS = Object.fromEntries(ALL_FRAMEWORKS.map(f => [f.id, f]));

// ── Custom (non-grid) renderer registry ───────────────────────────────────────
// Adding a new renderer here automatically wires up both its processor and
// its entry in the insert modal — no second edit needed elsewhere.

type ProcessorFn = (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => void;

interface CustomRenderer {
  id: string;
  label: string;
  description: string;
  template: string;
  createProcessor: (app: App) => ProcessorFn;
}

const CUSTOM_RENDERERS: CustomRenderer[] = [
  {
    id: "impact",
    label: "Impact Map",
    description: "All features tied to goals.",
    template: IMPACT_MAP_TEMPLATE,
    createProcessor: () => (source, el) => {
      const result = parseImpactMap(source);
      if (!result.ok) { renderError(result.error, el); return; }
      renderImpactMap(result.data, el);
    },
  },
  {
    id: "story",
    label: "User Story Map",
    description: "Release scope and priorities clear.",
    template: STORY_MAP_TEMPLATE,
    createProcessor: () => (source, el) => {
      const result = parseStoryMap(source);
      if (!result.ok) { renderError(result.error, el); return; }
      renderStoryMap(result.data, el);
    },
  },
  {
    id: "mindmap",
    label: "Mind Map",
    description: "Complex ideas structured and prioritised.",
    template: MIND_MAP_TEMPLATE,
    createProcessor: () => (source, el) => {
      const result = parseMindMap(source);
      if (!result.ok) { renderError(result.error, el); return; }
      renderMindMap(result.data, el);
    },
  },
  {
    id: "venn",
    label: "Venn Diagram",
    description: "Overlaps and gaps clearly identified.",
    template: VENN_TEMPLATE,
    createProcessor: (app) => (source, el, ctx) => {
      const result = parseVennDiagram(source);
      if (!result.ok) { renderError(result.error, el); return; }
      renderVennDiagram(result.data, el, (target) => {
        void app.workspace.openLinkText(target, ctx.sourcePath, false);
      });
    },
  },
  {
    id: "ost",
    label: "Opportunity Solution Tree",
    description: "Outcome drives opportunities, solutions, and experiments.",
    template: OST_TEMPLATE,
    createProcessor: () => (source, el) => {
      const result = parseOST(source);
      if (!result.ok) { renderError(result.error, el); return; }
      renderOST(result.data, el);
    },
  },
  {
    id: "carousel",
    label: "Image Carousel",
    description: "Multiple images as a navigable carousel.",
    template: CAROUSEL_TEMPLATE,
    createProcessor: (app) => (source, el, ctx) => {
      const result = parseCarouselBlock(source);
      if (!result.ok) { renderError(result.error, el); return; }
      renderCarouselBlock(result.data, el, (src) => {
        const file = app.vault.getFileByPath(
          ctx.sourcePath.replace(/[^/]+$/, "") + src
        );
        return file ? app.vault.getResourcePath(file) : src;
      });
    },
  },
  {
    id: "sipoc",
    label: "SIPOC Diagram",
    description: "Process scope: suppliers, inputs, steps, outputs, customers.",
    template: SIPOC_TEMPLATE,
    createProcessor: () => (source, el) => {
      // Detect flow variant: first non-blank, non-comment line is "type: flow"
      const firstLine = source.split("\n").find(l => l.trim() && !l.trim().startsWith("#"))?.trim() ?? "";
      if (firstLine === "type: flow") {
        const body = source.replace(/^\s*type:\s*flow\s*\n?/i, "");
        const result = parseSIPOCFlow(body);
        if (!result.ok) { renderError(result.error, el); return; }
        renderSIPOCFlow(result.data, el);
        return;
      }
      const result = parseSIPOC(source);
      if (!result.ok) { renderError(result.error, el); return; }
      renderSIPOC(result.data, el);
    },
  },
  {
    id: "wardley",
    label: "Wardley Map",
    description: "Value chain plotted against evolution to reveal strategic moves.",
    template: WARDLEY_TEMPLATE,
    createProcessor: () => (source, el) => {
      const result = parseWardleyMap(source);
      if (!result.ok) { renderError(result.error, el); return; }
      renderWardleyMap(result.data, el);
    },
  },
];

export default class VizardryPlugin extends Plugin {
  async onload(): Promise<void> {
    const registerProcessor = (id: string, handler: ProcessorFn): void => {
      try {
        this.registerMarkdownCodeBlockProcessor(id, handler);
      } catch (err) {
        console.error(`Vizardry: failed to register processor for "${id}"`, err);
      }
    };

    // ── Grid canvas renderers ──────────────────────────────────────────
    for (const [id, definition] of Object.entries(FRAMEWORKS)) {
      registerProcessor(id, (source, el, ctx) => {
        const result = parseFrameworkSource(source);
        if (!result.ok) { renderError(result.error, el); return; }
        renderCanvas(definition, result.data, result.links, el, (heading) => {
          void this.app.workspace.openLinkText(`#${heading}`, ctx.sourcePath, false);
        }, this.app, ctx);
      });
    }

    // ── Custom renderers ───────────────────────────────────────────────
    for (const renderer of CUSTOM_RENDERERS) {
      registerProcessor(renderer.id, renderer.createProcessor(this.app));
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
      {
        id: "sipoc-flow",
        label: "SIPOC Flow Diagram",
        description: tFrameworkDescription("sipoc-flow"),
        template: SIPOC_FLOW_TEMPLATE,
      },
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

  onunload(): void {}
}
