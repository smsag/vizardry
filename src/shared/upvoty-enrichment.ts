import { getUpvotyService } from "../upvoty";
import { enrichKeys, attachKeyTrigger } from "./key-enrichment";
import type { TicketRef } from "../sideleaf/types";

const ref = (key: string): TicketRef => ({ service: "upvoty", key });

/**
 * Scans `container` for Upvoty post keys (e.g. UPV-1234) in text nodes and
 * replaces each match with a `.vzd-upvoty-key` badge that opens the post's
 * card in the Vizardry sideleaf. Safe to call multiple times — already-
 * enriched keys are skipped.
 */
export function enrichUpvotyKeys(container: HTMLElement): void {
  const svc = getUpvotyService();
  if (!svc) return;
  const re = buildKeyRegex(svc.getKeyPrefix());
  enrichKeys(container, re, "vzd-upvoty-key", (doc, key) => {
    const btn = doc.createElement("button");
    btn.className = "vzd-upvoty-key";
    btn.textContent = shortenKey(key);
    btn.setAttribute("aria-label", `Upvoty: ${key}`);
    attachTrigger(btn, key);
    return btn;
  });
}

/** Shorten display text: keep prefix + first 8 chars of the ID segment + ellipsis. */
export function shortenKey(key: string): string {
  const dash = key.indexOf("-");
  if (dash === -1) return key;
  const id = key.slice(dash + 1);
  if (id.length <= 10) return key;
  return key.slice(0, dash + 1 + 8) + "…";
}

export function buildKeyRegex(prefix: string): RegExp {
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Accept either a standard UUID (from the Upvoty dashboard URL ?id=…)
  // or a base62 slug (22 alphanumeric chars from the post URL after ~).
  const uuid = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
  const base62 = "[A-Za-z0-9]{10,30}";
  return new RegExp(`\\b(${escaped}-(?:${uuid}|${base62}))\\b`, "g");
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
  if (!getUpvotyService()?.isEnabled()) return;
  const btn = parent.createEl("button", { cls: "vzd-upvoty-key", text: shortenKey(key) });
  btn.setAttribute("aria-label", `Upvoty: ${key}`);
  attachTrigger(btn, key);
}

function attachTrigger(btn: HTMLElement, key: string): void {
  attachKeyTrigger(btn, ref(key), () => !!getUpvotyService()?.isEnabled());
}
