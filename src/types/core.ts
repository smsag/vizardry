export interface FrameworkDefinition {
  id: string;
  label: string;
  blocks: BlockDefinition[];
  gridTemplate: string;
  gridColumns: string;
  gridRows: string;
  /** Show an editable `period:` timeframe field in the canvas header. */
  periodField?: boolean;
}

export interface BlockDefinition {
  label: string;
  area: string;
  /** Faint italic prompt shown when the block is empty. */
  placeholder?: string;
  /** Render block content as draggable cards (one card per non-empty line). */
  cardBlock?: boolean;
}

/**
 * Generic discriminated-union result type used by every parser.
 * `ok: true` carries the parsed data; `ok: false` carries a human-readable
 * error string suitable for display in the canvas error banner.
 */
export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * What `parseFrameworkSource` returns for a grid framework.
 *
 * Unlike the bespoke parsers it has no failure variant: every malformed line
 * is recoverable (skipped with a warning shown under the canvas), so a grid
 * block always renders. `ok` is kept — it is what the shared `Result<T>`
 * call sites destructure — but it is always `true`.
 */
export interface ParseResult {
  ok: true;
  /** Block label, lowercased, to its raw content. */
  data: Record<string, string>;
  /** Labels of blocks whose content renders as draggable cards. */
  cardBlocks: Set<string>;
  /** `cards: all` — every block renders as cards, whatever its own modifier. */
  allCards: boolean;
  /** Recoverable syntax problems, shown under the canvas. Absent when clean. */
  warnings?: string[];
}
