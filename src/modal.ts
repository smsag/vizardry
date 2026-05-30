import type { App, Editor} from "obsidian";
import { SuggestModal } from "obsidian";
import { insertTemplateAtCursor } from "./shared/editor";

export interface FrameworkOption {
  id: string;
  label: string;
  template: string;
  description: string;
}

export class CanvasInsertModal extends SuggestModal<FrameworkOption> {
  private editor: Editor;
  private options: FrameworkOption[];

  constructor(app: App, editor: Editor, options: FrameworkOption[]) {
    super(app);
    this.editor = editor;
    this.options = options;
    this.setPlaceholder("Search frameworks…");
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
    insertTemplateAtCursor(this.editor, option.template);
  }
}
