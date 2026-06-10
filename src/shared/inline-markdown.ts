/**
 * Renders a subset of inline markdown into DOM nodes inside `el`.
 * Supported: **bold**, *italic*, _italic_, ~~strikethrough~~.
 * Everything else is emitted as plain text.
 */
export function renderInline(el: HTMLElement, text: string): void {
  // Longer delimiters must come before shorter ones so ** is never parsed as two *.
  // Italic requires at least one non-whitespace char and forbids spanning newlines.
  const TOKEN = /\*\*(.*?)\*\*|~~(.*?)~~|\*((?!\s)[^*\n]+?)\*|_((?!\s)[^_\n]+?)_/g;
  let last = 0;

  for (const m of text.matchAll(TOKEN)) {
    if (m.index > last) el.appendText(text.slice(last, m.index));

    if (m[1] !== undefined) {
      el.createEl("strong").appendText(m[1]);
    } else if (m[2] !== undefined) {
      el.createEl("s").appendText(m[2]);
    } else {
      // m[3] = *italic*, m[4] = _italic_
      el.createEl("em").appendText((m[3] ?? m[4])!);
    }

    last = m.index + m[0].length;
  }

  if (last < text.length) el.appendText(text.slice(last));
}
