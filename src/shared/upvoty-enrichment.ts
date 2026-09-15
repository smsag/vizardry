import { getUpvotyService } from "../upvoty";
import { enrichKeys, createKeyBadge, shortenKey } from "./key-enrichment";
import type { TicketRef } from "../sideleaf/types";

export { shortenKey };

const CLS = "vzd-upvoty-key";
const ref = (key: string): TicketRef => ({ service: "upvoty", key });
const isEnabled = (): boolean => !!getUpvotyService()?.isEnabled();

function badge(doc: Document, key: string): HTMLElement {
  const prefix = getUpvotyService()?.getKeyPrefix();
  return createKeyBadge(doc, {
    cls: CLS,
    service: "Upvoty",
    ref: ref(key),
    label: shortenKey(key, prefix?.length),
    isEnabled,
  });
}

/**
 * Scans `container` for Upvoty post keys (e.g. UPV-1234) in text nodes and
 * replaces each match with a `.vzd-upvoty-key` badge that opens the post's
 * card in the Vizardry sideleaf. Safe to call multiple times — already-
 * enriched keys are skipped.
 */
export function enrichUpvotyKeys(container: HTMLElement): void {
  const svc = getUpvotyService();
  if (!svc) return;
  enrichKeys(container, buildKeyRegex(svc.getKeyPrefix()), CLS, badge);
}

// The regex depends only on the prefix; it used to be rebuilt for every
// rendered section and every classified link.
let cachedRegex: { prefix: string; re: RegExp } | null = null;

export function buildKeyRegex(prefix: string): RegExp {
  if (cachedRegex?.prefix === prefix) {
    cachedRegex.re.lastIndex = 0;
    return cachedRegex.re;
  }
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Accept either a standard UUID (from the Upvoty dashboard URL ?id=…)
  // or a base62 slug (22 alphanumeric chars from the post URL after ~).
  const uuid = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
  const base62 = "[A-Za-z0-9]{10,30}";
  const re = new RegExp(`\\b(${escaped}-(?:${uuid}|${base62}))\\b`, "g");
  cachedRegex = { prefix, re };
  return re;
}

/**
 * Renders a `.vzd-upvoty-key` badge for an explicitly-annotated key (e.g.
 * `[label](UPV-abc123...)`) — as opposed to `enrichUpvotyKeys`'s blind
 * text-node scan, this is for a key the caller already knows, attached to an
 * item whose own visible text may not contain it at all. No-ops if the
 * Upvoty integration isn't enabled, matching the same gating
 * `enrichUpvotyKeys` already applies before scanning (see main.ts).
 */
export function renderUpvotyKeyBadge(parent: HTMLElement, key: string): void {
  if (!isEnabled()) return;
  parent.appendChild(badge(parent.ownerDocument, key));
}
