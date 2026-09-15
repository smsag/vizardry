import { getLinearService } from "../linear";
import { enrichKeys, createKeyBadge } from "./key-enrichment";
import type { TicketRef } from "../sideleaf/types";

// Matches LINEAR-style identifiers like CORE-1234, PSINT-42, ENG-9999
export const LINEAR_KEY_RE = /\b([A-Z]{2,10}-\d+)\b/g;

const CLS = "vzd-linear-key";
const ref = (key: string): TicketRef => ({ service: "linear", key });
const isEnabled = (): boolean => !!getLinearService()?.isEnabled();

function badge(doc: Document, key: string): HTMLElement {
  return createKeyBadge(doc, { cls: CLS, service: "Linear", ref: ref(key), isEnabled });
}

/**
 * Scans `container` for Linear issue keys in text nodes and replaces each
 * match with a `.vzd-linear-key` badge that opens the issue's card in the
 * Vizardry sideleaf when clicked. Safe to call multiple times — already-
 * enriched keys are skipped.
 */
export function enrichLinearKeys(container: HTMLElement): void {
  enrichKeys(container, LINEAR_KEY_RE, CLS, badge);
}

/**
 * Renders a `.vzd-linear-key` badge for an explicitly-annotated key (e.g.
 * `[label](CORE-1234)`) — as opposed to `enrichLinearKeys`'s blind text-node
 * scan, this is for a key the caller already knows, attached to an item
 * whose own visible text may not contain it at all. No-ops if the Linear
 * integration isn't enabled, matching the same gating `enrichLinearKeys`
 * already applies before scanning (see main.ts) — never renders an inert
 * badge that can't do anything when clicked.
 */
export function renderLinearKeyBadge(parent: HTMLElement, key: string): void {
  if (!isEnabled()) return;
  parent.appendChild(badge(parent.ownerDocument, key));
}
