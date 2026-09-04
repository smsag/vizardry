/**
 * Frontmatter handling for the print pipeline — pure string logic (no DOM /
 * obsidian / Paged.js), so it stays unit-testable.
 */

/**
 * Strip a leading YAML frontmatter block so it doesn't render as a properties
 * node at the top of the printed document. Only a block at the very start of
 * the file is removed (the CommonMark/Obsidian frontmatter position); a `---`
 * later in the body (e.g. a thematic break) is left untouched.
 */
export function stripFrontmatter(markdown: string): string {
  // Optional BOM, then `---` line, lazily up to the closing `---` line.
  return markdown.replace(/^﻿?---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/, "");
}
