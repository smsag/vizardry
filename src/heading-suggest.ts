import type { App, Editor, EditorPosition, EditorSuggestContext, EditorSuggestTriggerInfo, TFile } from "obsidian";
import { EditorSuggest } from "obsidian";
import { isInsideVizardryFence } from "./shared/editor";
import { getHeadingsForFile } from "./shared/links";

const TRIGGER_RE = /\[\[#([^\]\[]*)$/;

/**
 * Offers heading autocomplete for `[[#Heading]]` — Vizardry's own inline
 * annotation syntax (see shared/links.ts) — specifically inside a ```vizardry
 * fence. Obsidian's native `[[` suggester still triggers there (its regex
 * isn't fence-aware) but its own insertion logic silently rejects the
 * selection once it detects the cursor is inside a code fence: the popup
 * flashes in but nothing happens when you pick an entry. Since we can't fix
 * core, and this is our own syntax, we register a more specific suggester
 * that only activates inside a vizardry fence and reliably completes there.
 */
export class VizardryHeadingSuggest extends EditorSuggest<string> {
  constructor(app: App) {
    super(app);
  }

  onTrigger(cursor: EditorPosition, editor: Editor, file: TFile | null): EditorSuggestTriggerInfo | null {
    if (!file) return null;

    const match = editor.getLine(cursor.line).slice(0, cursor.ch).match(TRIGGER_RE);
    if (!match) return null;

    // Only the (comparatively expensive) fence scan runs once the cheap regex
    // above has already matched — keeps this fast on every keystroke.
    if (!isInsideVizardryFence(editor, cursor.line)) return null;

    return {
      start: { line: cursor.line, ch: cursor.ch - match[0].length },
      end: cursor,
      query: match[1],
    };
  }

  getSuggestions(context: EditorSuggestContext): string[] {
    const query = context.query.toLowerCase();
    return getHeadingsForFile(this.app, context.file).filter(h => h.toLowerCase().includes(query));
  }

  renderSuggestion(heading: string, el: HTMLElement): void {
    el.setText(heading);
  }

  selectSuggestion(heading: string): void {
    if (!this.context) return;
    const { editor, start } = this.context;
    const replacement = `[[#${heading}]]`;
    editor.replaceRange(replacement, start, this.context.end);
    editor.setCursor({ line: start.line, ch: start.ch + replacement.length });
  }
}
