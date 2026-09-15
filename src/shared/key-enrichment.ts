/**
 * Inline key enrichment (Linear's CORE-1234, Upvoty's UPV-<uuid>): scanning
 * rendered text for key patterns and wrapping each match in a clickable
 * badge.
 *
 * A click used to build a floating popover here — positioned against the
 * viewport, flipped to stay on screen, stacked by z-index, and torn down when
 * its badge left the DOM. All of that is gone: a click now opens a card in
 * the Vizardry sideleaf, which is ordinary flow content that outlives the
 * note it came from. What is left in this module is the scanning, the badge,
 * and the open marker.
 */

import { onDisconnected } from "./lifecycle";
import { registerKeyBadge, unregisterKeyBadge } from "./key-open-state";
import { openTicketCard } from "../sideleaf";
import type { TicketRef } from "../sideleaf/types";
import { cardId } from "../sideleaf/types";

// Tags whose content should never be enriched.
// PRE skips multi-line code blocks (and their CODE children). Inline CODE is
// intentionally kept so a key enriches normally even inside inline code. A
// is skipped because wrapping a match in a <button> would nest interactive
// content inside a link — invalid HTML that produces inconsistent
// click/focus behaviour.
// BUTTON, SUMMARY and LABEL for the same reason as A: a badge is a button, and
// interactive content never nests (a Linear-shaped id inside an Upvoty badge
// used to get a button inside a button).
export const SKIP_TAGS = new Set(["PRE", "INPUT", "TEXTAREA", "SCRIPT", "STYLE", "A", "BUTTON", "SUMMARY", "LABEL"]);

/**
 * Builds the badge element every integration uses: one class, the key as
 * label (or a shortened one), an aria-label naming the service, and the
 * click/open-state wiring from `attachKeyTrigger`. Linear and Upvoty had two
 * identical copies each of this.
 */
export function createKeyBadge(
  doc: Document,
  opts: { cls: string; service: string; ref: TicketRef; label?: string; isEnabled: () => boolean },
): HTMLElement {
  const btn = doc.createElement("button");
  btn.className = opts.cls;
  btn.type = "button";
  btn.textContent = opts.label ?? opts.ref.key;
  btn.setAttribute("aria-label", `${opts.service}: ${opts.ref.key}`);
  attachKeyTrigger(btn, opts.ref, opts.isEnabled);
  return btn;
}

/**
 * Display text for a long key: the prefix plus the first 8 characters of the
 * id and an ellipsis. `prefixLength` is the configured prefix's length, so a
 * prefix that itself contains a dash (MY-APP) is not cut at the wrong place.
 */
export function shortenKey(key: string, prefixLength?: number): string {
  const dash = prefixLength !== undefined ? prefixLength : key.indexOf("-");
  if (dash <= 0 || dash >= key.length || key[dash] !== "-") return key;
  const id = key.slice(dash + 1);
  if (id.length <= 10) return key;
  return key.slice(0, dash + 1 + 8) + "…";
}

// ── DOM walking ──────────────────────────────────────────────────────────────

/**
 * Scans `container` for text nodes matching `re` and replaces each match
 * with a clickable badge built by `makeBadge`. Safe to call multiple times
 * — nodes already wrapped in an element with `enrichedClass` are skipped.
 */
export function enrichKeys(
  container: HTMLElement,
  re: RegExp,
  enrichedClass: string,
  makeBadge: (doc: Document, key: string) => HTMLElement,
): void {
  // Fast path for the common case — this runs on every rendered note when an
  // integration is enabled, most of which contain no keys. A single native
  // regex test over the concatenated text skips the recursive JS tree walk and
  // its allocations. A key can't match a text node without also matching here
  // (a node's text is a substring of `textContent`), so there are no false
  // negatives; the rare cross-node false positive just falls through to a no-op
  // walk. `test` advances lastIndex on a global regex, so reset it after.
  re.lastIndex = 0;
  if (!re.test(container.textContent ?? "")) return;
  re.lastIndex = 0;

  const nodes: Text[] = [];
  collectTextNodes(container, re, enrichedClass, nodes);
  for (const node of nodes) wrapTextNode(node, re, makeBadge);
}

function collectTextNodes(node: Node, re: RegExp, enrichedClass: string, out: Text[]): void {
  if (node.nodeType === Node.TEXT_NODE) {
    re.lastIndex = 0;
    if (re.test(node.textContent ?? "")) out.push(node as Text);
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const el = node as HTMLElement;
  if (SKIP_TAGS.has(el.tagName)) return;
  if (el.classList.contains(enrichedClass)) return;
  for (const child of Array.from(el.childNodes)) collectTextNodes(child, re, enrichedClass, out);
}

function wrapTextNode(node: Text, re: RegExp, makeBadge: (doc: Document, key: string) => HTMLElement): void {
  const text = node.textContent ?? "";
  const parent = node.parentNode;
  if (!parent) return;

  const doc = node.ownerDocument;
  const frag = doc.createDocumentFragment();
  let lastIndex = 0;
  re.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      frag.appendChild(doc.createTextNode(text.slice(lastIndex, match.index)));
    }
    frag.appendChild(makeBadge(doc, match[1]));
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex === 0) return;
  if (lastIndex < text.length) {
    frag.appendChild(doc.createTextNode(text.slice(lastIndex)));
  }
  parent.replaceChild(frag, node);
}

// ── Click trigger ────────────────────────────────────────────────────────────

/**
 * Wires a key badge to open its card in the sideleaf, and keeps the badge's
 * open marker in sync for as long as it is in the DOM.
 *
 * The badge registers under the card's id rather than under itself: one
 * ticket named in five notes has one card, and every badge for it lights up
 * together. That could not work while a popover belonged to the single badge
 * that spawned it.
 */
export function attachKeyTrigger(
  btn: HTMLElement,
  ref: TicketRef,
  isEnabled: () => boolean,
): void {
  const id = cardId(ref);
  registerKeyBadge(id, btn);

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (!isEnabled()) return;
    openTicketCard(ref);
  });

  // Only the registration is released when the badge goes: the card it opened
  // is the user's to close, and must survive the note being re-rendered or
  // closed entirely.
  //
  // Deferred a microtask: the badge is built before it is inserted, and the
  // watcher resolves its ancestor at registration time — registered now it
  // would fall back to document.body and never see the leaf's re-renders.
  // By the microtask the synchronous insertion has happened; a badge that was
  // never inserted at all is simply unregistered.
  queueMicrotask(() => {
    if (!btn.isConnected) { unregisterKeyBadge(id, btn); return; }
    onDisconnected(btn, () => unregisterKeyBadge(id, btn));
  });
}
