import { App, Editor, SuggestModal } from "obsidian";

export interface FrameworkOption {
  id: string;
  label: string;
  template: string;
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
      opt.label.toLowerCase().includes(q) || opt.id.toLowerCase().includes(q)
    );
  }

  renderSuggestion(option: FrameworkOption, el: HTMLElement): void {
    el.createEl("div", { text: option.label, cls: "suggestion-title" });
    el.createEl("div", { text: `\`\`\`${option.id}`, cls: "suggestion-note" });
  }

  onChooseSuggestion(option: FrameworkOption): void {
    const cursor = this.editor.getCursor();
    const lineText = this.editor.getLine(cursor.line);
    const onBlankLine = lineText.trim() === "";

    const from = onBlankLine
      ? { line: cursor.line, ch: 0 }
      : { line: cursor.line, ch: lineText.length };

    const insertion = onBlankLine ? option.template : "\n" + option.template;
    this.editor.replaceRange(insertion, from);

    // Place cursor on the first value field
    const firstKeyLine = cursor.line + (onBlankLine ? 1 : 2);
    const firstKeyText = this.editor.getLine(firstKeyLine);
    this.editor.setCursor({ line: firstKeyLine, ch: firstKeyText.length });
  }
}
