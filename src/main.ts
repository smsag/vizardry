import { Editor, MarkdownView, Notice, Plugin } from "obsidian";
import { parseFrameworkSource } from "./parser";
import { parseImpactMap } from "./impact";
import { parseStoryMap } from "./story";
import { parseMindMap } from "./mindmap";
import { parseOST } from "./frameworks/ost";
import { parseVennDiagram } from "./venn";
import { renderCanvas, renderImpactMap, renderStoryMap, renderMindMap, renderOST, renderVennDiagram, renderError } from "./renderer";
import { generateCanvasTemplate, IMPACT_MAP_TEMPLATE, STORY_MAP_TEMPLATE, MIND_MAP_TEMPLATE, OST_TEMPLATE, VENN_TEMPLATE, CAROUSEL_TEMPLATE } from "./templates";
import { CanvasInsertModal, FrameworkOption } from "./modal";
import { BMC } from "./frameworks/bmc";
import { LEAN } from "./frameworks/lean";
import { OPPORTUNITY } from "./frameworks/opportunity";
import { LEANUX } from "./frameworks/leanux";
import { VPC } from "./frameworks/vpc";
import { KATA } from "./frameworks/kata";
import { JOBS } from "./frameworks/jobs";
import { RAC } from "./frameworks/rac";
import { FrameworkDefinition } from "./types";
import { parseCarouselBlock, renderCarouselBlock } from "./carousel";

const FRAMEWORKS: Record<string, FrameworkDefinition> = {
  bmc: BMC,
  lean: LEAN,
  opportunity: OPPORTUNITY,
  leanux: LEANUX,
  vpc: VPC,
  kata: KATA,
  jobs: JOBS,
  rac: RAC,
};

export default class VizardryPlugin extends Plugin {
  async onload(): Promise<void> {
    // ── Register grid canvas renderers ─────────────────────────────
    for (const [id, definition] of Object.entries(FRAMEWORKS)) {
      try {
        this.registerMarkdownCodeBlockProcessor(id, (source, el, ctx) => {
          const result = parseFrameworkSource(source);
          if (!result.ok) { renderError(result.error, el); return; }
          renderCanvas(definition, result.data, result.links, el, (heading) => {
            this.app.workspace.openLinkText(`#${heading}`, ctx.sourcePath, false);
          });
        });
      } catch (err) {
        console.error(`Vizardry: failed to register processor for "${id}"`, err);
      }
    }

    // ── Impact Map renderer ────────────────────────────────────────
    try {
      this.registerMarkdownCodeBlockProcessor("impact", (source, el, _ctx) => {
        const result = parseImpactMap(source);
        if (!result.ok) { renderError(result.error, el); return; }
        renderImpactMap(result.data, el);
      });
    } catch (err) {
      console.error('Vizardry: failed to register processor for "impact"', err);
    }

    // ── Story Map renderer ─────────────────────────────────────────
    try {
      this.registerMarkdownCodeBlockProcessor("story", (source, el, _ctx) => {
        const result = parseStoryMap(source);
        if (!result.ok) { renderError(result.error, el); return; }
        renderStoryMap(result.data, el);
      });
    } catch (err) {
      console.error('Vizardry: failed to register processor for "story"', err);
    }
    // ── Mind Map renderer ─────────────────────────────────────────────────────
    try {
      this.registerMarkdownCodeBlockProcessor("mindmap", (source, el, _ctx) => {
        const result = parseMindMap(source);
        if (!result.ok) { renderError(result.error, el); return; }
        renderMindMap(result.data, el);
      });
    } catch (err) {
      console.error('Vizardry: failed to register processor for "mindmap"', err);
    }
    // ── Venn Diagram renderer ─────────────────────────────────────────────────
    try {
      this.registerMarkdownCodeBlockProcessor("venn", (source, el, ctx) => {
        const result = parseVennDiagram(source);
        if (!result.ok) { renderError(result.error, el); return; }
        renderVennDiagram(result.data, el, (target) => {
          this.app.workspace.openLinkText(target, ctx.sourcePath, false);
        });
      });
    } catch (err) {
      console.error('Vizardry: failed to register processor for "venn"', err);
    }

    // ── Opportunity Solution Tree renderer ─────────────────────────────────
    try {
      this.registerMarkdownCodeBlockProcessor("ost", (source, el, _ctx) => {
        const result = parseOST(source);
        if (!result.ok) { renderError(result.error, el); return; }
        renderOST(result.data, el);
      });
    } catch (err) {
      console.error('Vizardry: failed to register processor for "ost"', err);
    }

    // ── Carousel renderer ─────────────────────────────────────────────────
    try {
      this.registerMarkdownCodeBlockProcessor("carousel", (source, el, ctx) => {
        const result = parseCarouselBlock(source);
        if (!result.ok) { renderError(result.error, el); return; }
        renderCarouselBlock(result.data, el, (src) => {
          // Resolve vault-relative paths to resource URLs
          const file = this.app.vault.getFileByPath(
            ctx.sourcePath.replace(/[^/]+$/, "") + src
          );
          return file
            ? this.app.vault.getResourcePath(file)
            : src;
        });
      });
    } catch (err) {
      console.error('Vizardry: failed to register processor for "carousel"', err);
    }

    // ── Build framework options list (used by modal + commands) ────
    const frameworkOptions: FrameworkOption[] = [
      ...Object.entries(FRAMEWORKS).map(([id, def]) => ({
        id,
        label: def.label,
        template: generateCanvasTemplate(def),
        description: def.description,
      })),
      {
        id: "impact",
        label: "Impact Map",
        template: IMPACT_MAP_TEMPLATE,
        description: "All features tied to goals.",
      },
      {
        id: "story",
        label: "User Story Map",
        template: STORY_MAP_TEMPLATE,
        description: "Release scope and priorities clear.",
      },
      {
        id: "mindmap",
        label: "Mind Map",
        template: MIND_MAP_TEMPLATE,
        description: "Complex ideas structured and prioritised.",
      },
      {
        id: "venn",
        label: "Venn Diagram",
        template: VENN_TEMPLATE,
        description: "Overlaps and gaps clearly identified.",
      },
      {
        id: "ost",
        label: "Opportunity Solution Tree",
        template: OST_TEMPLATE,
        description: "Outcome drives opportunities, solutions, and experiments.",
      },
      {
        id: "carousel",
        label: "Image Carousel",
        template: CAROUSEL_TEMPLATE,
        description: "Multiple images as a navigable carousel.",
      },
    ];

    const withActiveMarkdownEditor = (run: (editor: Editor) => void): void => {
      const view = this.app.workspace.getActiveViewOfType(MarkdownView);
      const editor = view?.editor;
      if (!editor) {
        new Notice("Open a Markdown note in editing mode to use this command.");
        return;
      }
      run(editor);
    };

    const insertTemplateAtCursor = (editor: Editor, template: string): void => {
      const cursor = editor.getCursor();
      const lineText = editor.getLine(cursor.line);
      const onBlankLine = lineText.trim() === "";
      const from = onBlankLine
        ? { line: cursor.line, ch: 0 }
        : { line: cursor.line, ch: lineText.length };
      editor.replaceRange(onBlankLine ? template : "\n" + template, from);
      const firstKeyLine = cursor.line + (onBlankLine ? 1 : 2);
      const firstKeyText = editor.getLine(firstKeyLine);
      editor.setCursor({ line: firstKeyLine, ch: firstKeyText.length });
    };

    // ── Ribbon icon → opens insert modal ──────────────────────────
    this.addRibbonIcon("layout-template", "Insert Vizardry canvas…", () => {
      const view = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (!view) return;
      new CanvasInsertModal(this.app, view.editor, frameworkOptions).open();
    });

    // ── Command: fuzzy modal ───────────────────────────────────────
    this.addCommand({
      id: "insert-canvas",
      name: "Insert canvas…",
      callback: () => withActiveMarkdownEditor((editor) => {
        new CanvasInsertModal(this.app, editor, frameworkOptions).open();
      }),
    });

    // ── Commands: one per framework ───────────────────────────────
    for (const option of frameworkOptions) {
      this.addCommand({
        id: `insert-${option.id}`,
        name: `Insert ${option.label}`,
        callback: () => withActiveMarkdownEditor((editor) => {
          insertTemplateAtCursor(editor, option.template);
        }),
      });
    }

  }

  onunload(): void {
    // Processor registrations are cleaned up automatically by Obsidian.
    // DOM event listeners are attached to code block containers which
    // Obsidian destroys with the view — no manual teardown needed.
  }
}
