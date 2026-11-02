import type { App } from "obsidian";
import { SuggestModal } from "obsidian";
import { t } from "./i18n";

export interface FrameworkOption {
  id: string;
  label: string;
  template: string;
  description: string;
}

/**
 * Fuzzy framework picker. What a choice does is the caller's: insert the
 * template at the cursor, or insert a link that creates a new canvas note.
 */
export class CanvasInsertModal extends SuggestModal<FrameworkOption> {
  private options: FrameworkOption[];
  private onChoose: (option: FrameworkOption) => void;

  constructor(app: App, options: FrameworkOption[], onChoose: (option: FrameworkOption) => void) {
    super(app);
    this.options = options;
    this.onChoose = onChoose;
    this.setPlaceholder(t("commands.searchFrameworks"));
  }

  getSuggestions(query: string): FrameworkOption[] {
    const q = query.toLowerCase();
    return this.options.filter(opt =>
      opt.label.toLowerCase().includes(q) ||
      opt.id.toLowerCase().includes(q) ||
      opt.description.toLowerCase().includes(q)
    );
  }

  renderSuggestion(option: FrameworkOption, el: HTMLElement): void {
    el.createEl("div", { text: option.label, cls: "suggestion-title" });
    el.createEl("div", { text: option.description, cls: "suggestion-note" });
  }

  onChooseSuggestion(option: FrameworkOption): void {
    this.onChoose(option);
  }
}
