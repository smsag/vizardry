/** The two third-party services whose items can be carded in the sideleaf. */
export type TicketService = "linear" | "upvoty";

/** A single card's subject: which service, and the item's key within it. */
export interface TicketRef {
  service: TicketService;
  key: string;
}

/**
 * Stable identity for a card. Cards are deduplicated on this, so the same key
 * mentioned in five notes opens one card, not five — and it is what gets
 * persisted into the leaf's workspace state so cards survive a restart.
 */
export function cardId(ref: TicketRef): string {
  return `${ref.service}:${ref.key}`;
}

/**
 * Parses an id back into a ref. Used when rehydrating persisted state, which
 * is workspace.json — a file a user can edit and an older build may have
 * written, so an unrecognised service or an empty key yields null rather than
 * a card that can never load.
 */
export function parseCardId(id: unknown): TicketRef | null {
  if (typeof id !== "string") return null;
  const sep = id.indexOf(":");
  if (sep <= 0) return null;
  const service = id.slice(0, sep);
  const key = id.slice(sep + 1);
  if (!key) return null;
  if (service !== "linear" && service !== "upvoty") return null;
  return { service, key };
}
