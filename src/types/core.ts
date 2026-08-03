export interface FrameworkDefinition {
  id: string;
  label: string;
  blocks: BlockDefinition[];
  gridTemplate: string;
  gridColumns: string;
  gridRows: string;
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

// ParseResult has two sibling payload fields (data + links) on the success
// variant, which doesn't fit the single-data Result<T> pattern, so it is
// kept as a standalone definition.
export type ParseResult =
  | { ok: true; data: Record<string, string>; links: Record<string, string>; cardBlocks: Set<string>; allCards: boolean; warnings?: string[] }
  | { ok: false; error: string };
