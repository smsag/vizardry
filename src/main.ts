import { Editor, MarkdownView, Plugin } from "obsidian";
import { parseFrameworkSource } from "./parser";
import { parseImpactMap } from "./impact";
import { parseStoryMap } from "./story";
import { parseMindMap } from "./mindmap";
import { parseVennDiagram } from "./venn";
import { renderCanvas, renderImpactMap, renderStoryMap, renderMindMap, renderVennDiagram, renderError } from "./renderer";
import { generateCanvasTemplate, IMPACT_MAP_TEMPLATE, STORY_MAP_TEMPLATE, MIND_MAP_TEMPLATE, VENN_TEMPLATE } from "./templates";
import { CanvasInsertModal, FrameworkOption } from "./modal";
import { BMC } from "./frameworks/bmc";
import { LEAN } from "./frameworks/lean";
import { OPPORTUNITY } from "./frameworks/opportunity";
import { LEANUX } from "./frameworks/leanux";
import { VPC } from "./frameworks/vpc";
import { KATA } from "./frameworks/kata";
import { JOBS } from "./frameworks/jobs";
import { FrameworkDefinition } from "./types";
import { registerCarouselProcessor } from "./carousel";

const FRAMEWORKS: Record<string, FrameworkDefinition> = {
  bmc: BMC,
  lean: LEAN,
  opportunity: OPPORTUNITY,
  leanux: LEANUX,
  vpc: VPC,
  kata: KATA,
  jobs: JOBS,
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
    // ── Build framework options list (used by modal + commands) ────
    const frameworkOptions: FrameworkOption[] = [
      ...Object.entries(FRAMEWORKS).map(([id, def]) => ({
        id,
        label: def.label,
        template: generateCanvasTemplate(def),
      })),
      {
        id: "impact",
        label: "Impact Map",
        template: IMPACT_MAP_TEMPLATE,
      },
      {
        id: "story",
        label: "User Story Map",
        template: STORY_MAP_TEMPLATE,
      },
      {
        id: "mindmap",
        label: "Mind Map",
        template: MIND_MAP_TEMPLATE,
      },
      {
        id: "venn",
        label: "Venn Diagram",
        template: VENN_TEMPLATE,
      },
    ];

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
      editorCallback: (editor: Editor) => {
        new CanvasInsertModal(this.app, editor, frameworkOptions).open();
      },
    });

    // ── Commands: one per framework ───────────────────────────────
    for (const option of frameworkOptions) {
      this.addCommand({
        id: `insert-${option.id}`,
        name: `Insert ${option.label}`,
        editorCallback: (editor: Editor) => {
          const cursor = editor.getCursor();
          const lineText = editor.getLine(cursor.line);
          const onBlankLine = lineText.trim() === "";
          const from = onBlankLine
            ? { line: cursor.line, ch: 0 }
            : { line: cursor.line, ch: lineText.length };
          editor.replaceRange(onBlankLine ? option.template : "\n" + option.template, from);
          const firstKeyLine = cursor.line + (onBlankLine ? 1 : 2);
          const firstKeyText = editor.getLine(firstKeyLine);
          editor.setCursor({ line: firstKeyLine, ch: firstKeyText.length });
        },
      });
    }

    // ── Image carousel post-processor ─────────────────────────────
    registerCarouselProcessor(this);
  }

  onunload(): void {
    // Processor registrations are cleaned up automatically by Obsidian.
    // DOM event listeners are attached to code block containers which
    // Obsidian destroys with the view — no manual teardown needed.
  }
}
