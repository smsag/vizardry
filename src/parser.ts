import type { ParseResult } from "./types";
import { indentOf } from "./shared/indent";

/** Strips a body line's real leading whitespace (a tab is one character but
 *  four columns), keeping any indentation deeper than the body's own. */
export function reindent(raw: string, lineIndent: number, baseIndent: number): string {
  return " ".repeat(Math.max(0, lineIndent - baseIndent)) + raw.trimStart();
}

/**
 * Parses the `block: Label\n  content` syntax used by all grid frameworks.
 *
 * Syntax:
 *   block: Label
 *     Content line 1
 *     Content line 2
 *
 * Display-mode modifier (optional, appended after a pipe):
 *   block: Label | card     — render block content as draggable cards
 *   (any other modifier is silently ignored — plain bullet text is the
 *   standard rendering and there is no explicit way to force it back on)
 *
 * Canvas-wide option:
 *   cards: all   — render every block in the canvas as cards, overriding
 *                  any per-block modifier
 *
 * Rules:
 * - `block:` keyword (case-insensitive, like every other config keyword)
 *   followed by the block label (case-insensitively matched at render time)
 * - Content is indented below the block line — no `|` scalar needed
 * - Lines starting with `//` are comments (ignored)
 * - Unknown block labels are stored but silently ignored at render time
 * - A block label declared twice keeps the first occurrence and warns; the
 *   later one is skipped rather than silently discarding the first's content
 * - Blank lines between blocks are ignored
 * - Heading links use inline [[#Heading]] annotations on block lines (see shared/links.ts)
 */
export function parseFrameworkSource(source: string): ParseResult {
  const data: Record<string, string> = {};
  const cardBlocks = new Set<string>();
  const warnings: string[] = [];
  let allCards = false;
  const lines = source.split("\n");
  let i = 0;

  while (i < lines.length) {
    const raw = lines[i];
    const trimmed = raw.trim();

    if (trimmed === "" || trimmed.startsWith("//")) {
      i++;
      continue;
    }

    const indent = indentOf(raw);

    if (indent > 0) {
      warnings.push(`Line ${i + 1}: unexpected indentation — skipped`);
      i++;
      continue;
    }

    if (trimmed.toLowerCase().startsWith("title:") || trimmed.toLowerCase().startsWith("collapsed:")
      || trimmed.toLowerCase().startsWith("period:")) {
      i++;
      continue;
    }

    if (trimmed.toLowerCase().startsWith("cards:")) {
      const value = trimmed.slice("cards:".length).trim().toLowerCase();
      if (value !== "all") {
        warnings.push(`Line ${i + 1}: unknown value "${value}" for "cards:" (expected "all") — ignored`);
      } else {
        allCards = true;
      }
      i++;
      continue;
    }

    if (trimmed.toLowerCase().startsWith("block:")) {
      const headerLine = i + 1;
      const rawLabel = trimmed.slice("block:".length).trim();

      // Strip optional | card modifier (any other modifier is ignored)
      const pipeIdx = rawLabel.indexOf("|");
      const label = pipeIdx !== -1 ? rawLabel.slice(0, pipeIdx).trim() : rawLabel;
      const isCard = pipeIdx !== -1 && rawLabel.slice(pipeIdx + 1).trim().toLowerCase() === "card";
      const key = label.toLowerCase();

      // Consume the block's indented content first, so a bad/duplicate header
      // can be dropped without its content leaking as top-level lines.
      const contentLines: string[] = [];
      i++;
      let blockIndent = -1;
      const leadingComments: string[] = [];

      while (i < lines.length) {
        const blockRaw = lines[i];
        const blockTrimmed = blockRaw.trim();

        const lineIndent = indentOf(blockRaw);
        // An indented comment stays in the content so an edit writes it back;
        // renderers skip it. Before the first content line the body indent is
        // not known yet, so it waits in `leadingComments`.
        if (blockTrimmed.startsWith("//") && lineIndent > 0) {
          if (blockIndent === -1) leadingComments.push(blockTrimmed);
          else contentLines.push(reindent(blockRaw, lineIndent, blockIndent));
          i++;
          continue;
        }
        if (blockTrimmed === "" || blockTrimmed.startsWith("//")) {
          if (blockIndent !== -1) contentLines.push("");
          i++;
          continue;
        }

        if (lineIndent === 0) break; // back to root level
        if (blockIndent === -1) {
          blockIndent = lineIndent;
          contentLines.push(...leadingComments);
          leadingComments.length = 0;
        }
        if (lineIndent < blockIndent) break;
        contentLines.push(reindent(blockRaw, lineIndent, blockIndent));
        i++;
      }

      contentLines.push(...leadingComments); // a block holding only comments
      // Strip trailing blank lines
      while (contentLines.length > 0 && contentLines[contentLines.length - 1].trim() === "") {
        contentLines.pop();
      }

      // Recoverable: a label-less or duplicate block is dropped with a warning.
      if (!label) {
        warnings.push(`Line ${headerLine}: "block:" has no label — skipped`);
        continue;
      }
      // Own property only: `in` walks the prototype chain, so a block labelled
      // "constructor" was reported as a duplicate and dropped.
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        warnings.push(`Line ${headerLine}: duplicate "block: ${label}" — later one skipped`);
        continue;
      }

      if (isCard) cardBlocks.add(key);
      data[key] = contentLines.join("\n");

    } else {
      warnings.push(`Line ${i + 1}: unexpected line "${trimmed}" (use "block: Label") — skipped`);
      i++;
    }
  }

  return { ok: true, data, cardBlocks, allCards, warnings: warnings.length ? warnings : undefined };
}
