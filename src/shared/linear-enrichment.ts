import { getLinearService } from "../linear";
import { enrichKeys, attachKeyTrigger } from "./key-enrichment";
import type { TicketRef } from "../sideleaf/types";

// Matches LINEAR-style identifiers like CORE-1234, PSINT-42, ENG-9999
export const LINEAR_KEY_RE = /\b([A-Z]{2,10}-\d+)\b/g;

const ref = (key: string): TicketRef => ({ service: "linear", key });

/**
 * Scans `container` for Linear issue keys in text nodes and replaces each
 * match with a `.vzd-linear-key` badge that opens the issue's card in the
 * Vizardry sideleaf when clicked. Safe to call multiple times — already-
 * enriched keys are skipped.
 */
export function enrichLinearKeys(container: HTMLElement): void {
  enrichKeys(container, LINEAR_KEY_RE, "vzd-linear-key", (doc, key) => {
    const btn = doc.createElement("button");
    btn.className = "vzd-linear-key";
    btn.textContent = key;
    btn.setAttribute("aria-label", `Linear: ${key}`);
    attachTrigger(btn, key);
    return btn;
  });
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
  if (!getLinearService()?.isEnabled()) return;
  const btn = parent.createEl("button", { cls: "vzd-linear-key", text: key });
  btn.setAttribute("aria-label", `Linear: ${key}`);
  attachTrigger(btn, key);
}

function attachTrigger(btn: HTMLElement, key: string): void {
  attachKeyTrigger(btn, ref(key), () => !!getLinearService()?.isEnabled());
}
