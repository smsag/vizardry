import { Plugin } from "obsidian";
import { parseFrameworkSource } from "./parser";
import { renderCanvas, renderError } from "./renderer";
import { BMC } from "./frameworks/bmc";
import { LEAN } from "./frameworks/lean";
import { FrameworkDefinition } from "./types";

const FRAMEWORKS: Record<string, FrameworkDefinition> = {
  bmc: BMC,
  lean: LEAN,
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
  }

  onunload(): void {
    // Processor registrations are cleaned up automatically by Obsidian.
    // DOM event listeners created via renderCanvas are attached to code block
    // containers which Obsidian destroys with the view — no manual teardown needed.
  }
}
