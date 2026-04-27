import { Plugin } from "obsidian";
import { parseFrameworkSource } from "./parser";
import { parseImpactMap } from "./impact";
import { renderCanvas, renderImpactMap, renderError } from "./renderer";
import { BMC } from "./frameworks/bmc";
import { LEAN } from "./frameworks/lean";
import { OPPORTUNITY } from "./frameworks/opportunity";
import { LEANUX } from "./frameworks/leanux";
import { VPC } from "./frameworks/vpc";
import { KATA } from "./frameworks/kata";
import { JOBS } from "./frameworks/jobs";
import { FrameworkDefinition } from "./types";

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
    for (const [id, definition] of Object.entries(FRAMEWORKS)) {
      try {
        this.registerMarkdownCodeBlockProcessor(id, (source, el) => {
          const result = parseFrameworkSource(source);
          if (!result.ok) {
            renderError(result.error, el);
            return;
          }
          renderCanvas(definition, result.data, el);
        });
      } catch (err) {
        console.error(`Vizardry: failed to register processor for "${id}"`, err);
      }
    }

    try {
      this.registerMarkdownCodeBlockProcessor("impact", (source, el) => {
        const result = parseImpactMap(source);
        if (!result.ok) {
          renderError(result.error, el);
          return;
        }
        renderImpactMap(result.data, el);
      });
    } catch (err) {
      console.error('Vizardry: failed to register processor for "impact"', err);
    }
  }

  onunload(): void {
    // Processor registrations are cleaned up automatically by Obsidian.
    // DOM event listeners created via renderCanvas are attached to code block
    // containers which Obsidian destroys with the view — no manual teardown needed.
  }
}
