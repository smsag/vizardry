import { getLinearService } from "../linear";
import { enrichKeys, createKeyBadge, attachKeyTrigger } from "./key-enrichment";
import type { TicketRef } from "../sideleaf/types";

// Linear issue keys like CORE-1234, PSS2-105, D-8: the pattern of the shared
// Mermaid/Linear contract with Nimbus (Contracts/MERMAID-LINEAR.md § 1, in the
// Nimbus repository), so both apps see the same keys. Group 1 is the whole key.
// Not inside a word, a path (…/issue/CORE-1) or a longer key; no leading zero.
export const LINEAR_KEY_RE = /(?<![A-Za-z0-9_/-])([A-Z][A-Z0-9]{0,9}-[1-9][0-9]{0,6})(?![A-Za-z0-9_-])/g;

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

/**
 * Badges the Linear keys in the node labels of a drawn Mermaid diagram.
 * Edge labels (`g.edgeLabel`) and subgraph titles (`g.cluster`) are not inside
 * a `g.node`, so they stay plain. HTML labels (Mermaid's default, in a
 * `foreignObject`) get the usual badge; the text after a key — Nimbus's status —
 * stays plain text. An SVG `<text>` label cannot hold a `<button>`, so there the
 * whole label opens its first key instead, and the drawing stays valid SVG.
 */
export function enrichMermaidLinearKeys(svg: Element): void {
  svg.querySelectorAll<HTMLElement>("g.node foreignObject > div").forEach(enrichLinearKeys);
  svg.querySelectorAll<SVGTextElement>("g.node text").forEach((text) => {
    if (text.classList.contains(MERMAID_TEXT_CLS)) return;
    LINEAR_KEY_RE.lastIndex = 0;
    const m = LINEAR_KEY_RE.exec(text.textContent ?? "");
    if (!m) return;
    text.classList.add(MERMAID_TEXT_CLS);
    attachKeyTrigger(text as unknown as HTMLElement, ref(m[1]), isEnabled);
  });
}

const MERMAID_TEXT_CLS = "vzd-mermaid-linear-key";
// Longest a Mermaid diagram may take to draw before we stop watching for it.
const MERMAID_WAIT_MS = 30_000;

/**
 * Mermaid draws after Markdown post-processors run, so its labels are not there
 * yet when the global Linear post-processor scans `el`. If `el` holds a Mermaid
 * block, watch it until the SVG is in and badge its labels then.
 */
export function enrichMermaidWhenDrawn(el: HTMLElement): void {
  if (!el.querySelector(".mermaid, code.language-mermaid") && !el.classList.contains("mermaid")) return;
  const run = (): boolean => {
    const svgs = el.querySelectorAll(".mermaid svg, svg[id^='mermaid']");
    svgs.forEach(enrichMermaidLinearKeys);
    return svgs.length > 0;
  };
  if (run()) return;
  const observer = new MutationObserver(() => { if (run()) stop(); });
  const timer = setTimeout(() => stop(), MERMAID_WAIT_MS);
  const stop = (): void => { observer.disconnect(); clearTimeout(timer); };
  observer.observe(el, { childList: true, subtree: true });
}
