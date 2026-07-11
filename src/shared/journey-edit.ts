import type { App, MarkdownPostProcessorContext } from "obsidian";
import { Notice } from "obsidian";
import type { JourneyLaneKey } from "../types";
import { JOURNEY_LANE_CONFIG } from "../journey";
import { resolveEditor } from "./editor";

const LANE_KEYS = JOURNEY_LANE_CONFIG.map(l => l.key);

/** Escapes a string for safe use inside a RegExp. */
function escRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface PhaseLaneLine {
  line: number;
  key: JourneyLaneKey;
  name: string;
  subtitle: string;
  raw: string;
}

interface PhaseBlock {
  phaseLine: number;
  phaseIndent: number;
  laneIndent: number; // -1 if the phase has no lane lines yet
  laneLines: PhaseLaneLine[];
}

/**
 * Finds the block boundaries of a `phase: <phaseName>` declaration —
 * structural analogue of story-edit.ts's findStepBlock, one nesting level
 * instead of two. Lane lines are collected in source order regardless of
 * key, since an author may freely interleave lane keywords within a phase.
 */
function findPhaseBlock(
  editor: { getLine: (n: number) => string },
  lineStart: number,
  lineEnd: number,
  phaseName: string,
): PhaseBlock | null {
  const phaseKey = phaseName.toLowerCase().trim();
  let phaseLine = -1;
  let phaseIndent = 0;
  let laneIndent = -1;
  const laneLines: PhaseLaneLine[] = [];

  for (let ln = lineStart; ln <= lineEnd; ln++) {
    const raw = editor.getLine(ln);
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("//")) continue;
    const indent = raw.search(/\S/);

    if (phaseLine === -1) {
      if (indent !== 0) continue;
      if (trimmed.toLowerCase().startsWith("phase:")) {
        const name = trimmed.slice("phase:".length).trim().toLowerCase();
        if (name === phaseKey) {
          phaseLine = ln;
          phaseIndent = indent;
        }
      }
      continue;
    }

    // Inside the target phase
    if (indent <= phaseIndent) break;

    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) continue;
    const key = trimmed.slice(0, colonIdx).trim().toLowerCase() as JourneyLaneKey;
    if (!LANE_KEYS.includes(key)) continue;

    if (laneIndent === -1) laneIndent = indent;
    const rest = trimmed.slice(colonIdx + 1).trim();
    const pipeIdx = rest.indexOf("|");
    const name = pipeIdx === -1 ? rest : rest.slice(0, pipeIdx).trim();
    const subtitle = pipeIdx === -1 ? "" : rest.slice(pipeIdx + 1).trim();
    laneLines.push({ line: ln, key, name, subtitle, raw });
  }

  if (phaseLine === -1) return null;
  return { phaseLine, phaseIndent, laneIndent, laneLines };
}

/**
 * Writes or removes a top-level `persona:` or `scenario:` line.
 * Verbatim structural copy of story-edit.ts's writeStoryMeta.
 */
export function writeJourneyMeta(
  app: App,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  key: "persona" | "scenario",
  value: string,
): boolean {
  const resolved = resolveEditor(app, ctx, el, "writeJourneyMeta");
  if (!resolved) return false;
  const { editor, lineStart, lineEnd } = resolved;

  const trimmedValue = value.trim();

  let foundLine = -1;
  for (let ln = lineStart + 1; ln < lineEnd; ln++) {
    if (editor.getLine(ln).trim().toLowerCase().startsWith(`${key}:`)) {
      foundLine = ln;
      break;
    }
  }

  if (!trimmedValue) {
    if (foundLine !== -1) {
      editor.replaceRange("", { line: foundLine, ch: 0 }, { line: foundLine + 1, ch: 0 });
    }
    return true;
  }

  const newLineText = `${key}: ${trimmedValue}`;

  if (foundLine !== -1) {
    const raw = editor.getLine(foundLine);
    editor.replaceRange(newLineText, { line: foundLine, ch: 0 }, { line: foundLine, ch: raw.length });
    return true;
  }

  let insertAt = lineStart + 1;
  const firstContent = editor.getLine(lineStart + 1).trim().toLowerCase();
  if (firstContent.startsWith("title:")) insertAt = lineStart + 2;

  editor.replaceRange(`${newLineText}\n`, { line: insertAt, ch: 0 });
  return true;
}

/** Renames a `phase: <oldName>` line in-place. Phase names are not
 *  referenced elsewhere in the source, so no cascade is needed. */
export function renamePhase(
  app: App,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  oldName: string,
  newName: string,
): boolean {
  if (!newName.trim() || newName === oldName) return false;

  const resolved = resolveEditor(app, ctx, el, "renamePhase");
  if (!resolved) return false;
  const { editor, lineStart, lineEnd } = resolved;

  const re = new RegExp(`^(phase:\\s*)${escRe(oldName)}\\s*$`, "i");

  for (let ln = lineStart; ln <= lineEnd; ln++) {
    const raw = editor.getLine(ln);
    if (re.test(raw.trim())) {
      editor.replaceRange(`phase: ${newName}`, { line: ln, ch: 0 }, { line: ln, ch: raw.length });
      return true;
    }
  }

  new Notice(`Vizardry: phase "${oldName}" not found.`, 4000);
  return false;
}

/** Appends a new `<laneKey>: <cardName>` line at the end of the named
 *  phase's cards for that lane. No dedup — journey cards aren't
 *  cross-referenced by name anywhere else in the source. */
export function addJourneyCard(
  app: App,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  phaseName: string,
  laneKey: JourneyLaneKey,
  cardName: string,
): boolean {
  const resolved = resolveEditor(app, ctx, el, "addJourneyCard");
  if (!resolved) return false;
  const { editor, lineStart, lineEnd } = resolved;

  const block = findPhaseBlock(editor, lineStart, lineEnd, phaseName);
  if (!block) {
    new Notice(`Vizardry: phase "${phaseName}" not found in journey map.`, 4000);
    return false;
  }

  const laneMatches = block.laneLines.filter(l => l.key === laneKey);
  const insertAfter = laneMatches.length > 0
    ? laneMatches[laneMatches.length - 1].line
    : (block.laneLines.length > 0 ? block.laneLines[block.laneLines.length - 1].line : block.phaseLine);
  const indentStr = block.laneIndent !== -1 ? " ".repeat(block.laneIndent) : " ".repeat(block.phaseIndent + 2);

  const insertLine = editor.getLine(insertAfter);
  editor.replaceRange(
    `\n${indentStr}${laneKey}: ${cardName.trim() || "New Card"}`,
    { line: insertAfter, ch: insertLine.length },
  );
  return true;
}

/** Deletes the Nth card in the named phase's lane. */
export function deleteJourneyCard(
  app: App,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  phaseName: string,
  laneKey: JourneyLaneKey,
  cardIndex: number,
): boolean {
  const resolved = resolveEditor(app, ctx, el, "deleteJourneyCard");
  if (!resolved) return false;
  const { editor, lineStart, lineEnd } = resolved;

  const block = findPhaseBlock(editor, lineStart, lineEnd, phaseName);
  if (!block) {
    new Notice(`Vizardry: phase "${phaseName}" not found in journey map.`, 4000);
    return false;
  }

  const laneMatches = block.laneLines.filter(l => l.key === laneKey);
  const target = laneMatches[cardIndex];
  if (!target) {
    new Notice(`Vizardry: card not found in "${phaseName}".`, 4000);
    return false;
  }

  editor.replaceRange("", { line: target.line, ch: 0 }, { line: target.line + 1, ch: 0 });
  return true;
}

/** Renames the Nth card in the named phase's lane, preserving its subtitle. */
export function renameJourneyCard(
  app: App,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  phaseName: string,
  laneKey: JourneyLaneKey,
  cardIndex: number,
  newName: string,
): boolean {
  if (!newName.trim()) return false;

  const resolved = resolveEditor(app, ctx, el, "renameJourneyCard");
  if (!resolved) return false;
  const { editor, lineStart, lineEnd } = resolved;

  const block = findPhaseBlock(editor, lineStart, lineEnd, phaseName);
  if (!block) {
    new Notice(`Vizardry: phase "${phaseName}" not found in journey map.`, 4000);
    return false;
  }

  const laneMatches = block.laneLines.filter(l => l.key === laneKey);
  const target = laneMatches[cardIndex];
  if (!target) {
    new Notice(`Vizardry: card not found in "${phaseName}".`, 4000);
    return false;
  }

  const indent = target.raw.match(/^(\s*)/)![1];
  const newText = target.subtitle
    ? `${indent}${laneKey}: ${newName} | ${target.subtitle}`
    : `${indent}${laneKey}: ${newName}`;
  editor.replaceRange(newText, { line: target.line, ch: 0 }, { line: target.line, ch: target.raw.length });
  return true;
}

/** Reorders a card within the same phase/lane by swapping line *contents*
 *  across the identified line numbers — necessary since same-lane lines
 *  aren't guaranteed to be physically contiguous (an author may interleave
 *  lane keywords within a phase). */
export function reorderJourneyCard(
  app: App,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  phaseName: string,
  laneKey: JourneyLaneKey,
  fromIndex: number,
  toIndex: number,
): boolean {
  if (fromIndex === toIndex) return true;

  const resolved = resolveEditor(app, ctx, el, "reorderJourneyCard");
  if (!resolved) return false;
  const { editor, lineStart, lineEnd } = resolved;

  const block = findPhaseBlock(editor, lineStart, lineEnd, phaseName);
  if (!block) return true;

  const laneMatches = block.laneLines.filter(l => l.key === laneKey);
  if (laneMatches.length < 2) return true;

  const cards = laneMatches.map(m => ({ name: m.name, subtitle: m.subtitle }));
  const [moved] = cards.splice(fromIndex, 1);
  cards.splice(toIndex, 0, moved);

  type Edit = { line: number; newText: string };
  const edits: Edit[] = laneMatches.map((m, i) => {
    const indent = m.raw.match(/^(\s*)/)![1];
    const c = cards[i];
    const newText = c.subtitle ? `${indent}${laneKey}: ${c.name} | ${c.subtitle}` : `${indent}${laneKey}: ${c.name}`;
    return { line: m.line, newText };
  });

  edits.sort((a, b) => b.line - a.line);
  for (const edit of edits) {
    const raw = editor.getLine(edit.line);
    editor.replaceRange(edit.newText, { line: edit.line, ch: 0 }, { line: edit.line, ch: raw.length });
  }
  return true;
}

/**
 * Moves a card to a different phase within the same lane (cross-phase drag).
 * Always appends to the end of the destination phase's lane — the
 * destination drop index isn't used, matching moveStoryTaskCrossColumn's own
 * precedent of ignoring the exact within-column drop position on a
 * cross-column move.
 */
export function moveJourneyCardCrossPhase(
  app: App,
  ctx: MarkdownPostProcessorContext,
  el: HTMLElement,
  cardIndex: number,
  fromPhaseName: string,
  toPhaseName: string,
  laneKey: JourneyLaneKey,
): boolean {
  if (fromPhaseName === toPhaseName) return true;

  const resolved = resolveEditor(app, ctx, el, "moveJourneyCardCrossPhase");
  if (!resolved) return false;
  const { editor, lineStart, lineEnd } = resolved;

  const fromBlock = findPhaseBlock(editor, lineStart, lineEnd, fromPhaseName);
  if (!fromBlock) {
    new Notice(`Vizardry: source phase "${fromPhaseName}" not found.`, 4000);
    return false;
  }
  const fromMatches = fromBlock.laneLines.filter(l => l.key === laneKey);
  const source = fromMatches[cardIndex];
  if (!source) {
    new Notice(`Vizardry: card not found in "${fromPhaseName}".`, 4000);
    return false;
  }

  const toBlock = findPhaseBlock(editor, lineStart, lineEnd, toPhaseName);
  if (!toBlock) {
    new Notice(`Vizardry: destination phase "${toPhaseName}" not found.`, 4000);
    return false;
  }
  const toMatches = toBlock.laneLines.filter(l => l.key === laneKey);
  const insertAfterLine = toMatches.length > 0
    ? toMatches[toMatches.length - 1].line
    : (toBlock.laneLines.length > 0 ? toBlock.laneLines[toBlock.laneLines.length - 1].line : toBlock.phaseLine);
  const indentStr = toBlock.laneIndent !== -1 ? " ".repeat(toBlock.laneIndent) : " ".repeat(toBlock.phaseIndent + 2);
  const newCardLine = source.subtitle
    ? `${indentStr}${laneKey}: ${source.name} | ${source.subtitle}`
    : `${indentStr}${laneKey}: ${source.name}`;

  // Apply delete + insert ordered by comparing line numbers, so a same-document
  // edit on either side of the other doesn't shift the other's line offset —
  // mirrors moveStoryTaskCrossColumn's branching.
  if (source.line > insertAfterLine) {
    editor.replaceRange("", { line: source.line, ch: 0 }, { line: source.line + 1, ch: 0 });
    const afterText = editor.getLine(insertAfterLine);
    editor.replaceRange(`\n${newCardLine}`, { line: insertAfterLine, ch: afterText.length });
  } else {
    const afterText = editor.getLine(insertAfterLine);
    editor.replaceRange(`\n${newCardLine}`, { line: insertAfterLine, ch: afterText.length });
    editor.replaceRange("", { line: source.line, ch: 0 }, { line: source.line + 1, ch: 0 });
  }

  return true;
}
