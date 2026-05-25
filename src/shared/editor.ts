import { Editor } from "obsidian";

export function insertTemplateAtCursor(editor: Editor, template: string): void {
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
}
