import { getLinearService } from "../linear";
import { enrichKeys, createKeyBadge, attachKeyTrigger } from "./key-enrichment";
import type { TicketRef } from "../sideleaf/types";

// Linear issue keys like CORE-1234, PSS2-105, D-8: the pattern of the shared
// Mermaid/Linear contract with Nimbus (Contracts/MERMAID-LINEAR.md § 1, in the
// Nimbus repository), so both apps see the same keys. Not inside a word, a path
// (…/issue/CORE-1) or a longer key; no leading zero.
// The contract writes the "not after" part as a lookbehind. Safari before 16.4
// (Obsidian mobile still supports iOS 15) cannot parse one, and a regex literal
// it cannot parse stops the whole plugin from loading, so here the character
// before the key is matched instead (non-capturing). Same keys; group 1 is the
// key, and it starts at `index + [0].length - [1].length`, not at `index`.
export const LINEAR_KEY_RE = /(?:^|[^A-Za-z0-9_/-])([A-Z][A-Z0-9]{0,9}-[1-9][0-9]{0,6})(?![A-Za-z0-9_-])/g;
// What every key contains, without the neighbour checks: enrichKeys' quick
// "any key in here?" test runs over text joined across elements.
const LINEAR_KEY_HINT = /[A-Z][A-Z0-9]{0,9}-[1-9]/;

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
  enrichKeys(container, LINEAR_KEY_RE, CLS, badge, LINEAR_KEY_HINT);
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

/** The first key in `el`'s text, looking at each text node on its own (lines of a label are separate nodes). */
function firstKey(el: Element): string | null {
  const walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    LINEAR_KEY_RE.lastIndex = 0;
    const m = LINEAR_KEY_RE.exec(n.nodeValue ?? "");
    LINEAR_KEY_RE.lastIndex = 0;
    if (m) return m[1];
  }
  return null;
}

// Flowcharts only (contract § 2): Mermaid.js marks them with an
// aria-roledescription, Obsidian's own renderer (Pele, Obsidian 1.15+) with a class.
const FLOWCHART = "svg[aria-roledescription^='flowchart'], svg.pele-flowchart";
// Node labels as HTML (Mermaid.js's default, in a foreignObject).
const HTML_LABELS = "g.node foreignObject > div";
// Node labels as SVG text: Mermaid.js with htmlLabels off, and every Pele label.
const SVG_LABELS = "g.node text, g.pele-node text.pele-label";
const MERMAID_TEXT_CLS = "vzd-mermaid-linear-key";

/**
 * Badges the Linear keys in the node labels of a drawn Mermaid flowchart.
 * Edge labels and subgraph titles are not inside a node group, so they stay
 * plain. HTML labels get the usual badge; the text after a key — Nimbus's status
 * — stays plain text. An SVG `<text>` label cannot hold a `<button>`, so there
 * the label itself becomes the button for its first key, and the drawing stays
 * valid SVG. A node that is a link (Mermaid `click … href`, Obsidian's
 * `internal-link`) keeps its link: no key in it is enriched.
 */
export function enrichMermaidLinearKeys(svg: Element): void {
  if (!svg.matches(FLOWCHART)) return;
  svg.querySelectorAll<HTMLElement>(HTML_LABELS).forEach((label) => {
    if (!label.closest("a")) enrichLinearKeys(label);
  });
  svg.querySelectorAll<SVGTextElement>(SVG_LABELS).forEach((text) => {
    if (text.classList.contains(MERMAID_TEXT_CLS) || text.closest("a")) return;
    const key = firstKey(text);
    if (!key) return;
    text.classList.add(MERMAID_TEXT_CLS);
    text.setAttribute("role", "button");
    text.setAttribute("tabindex", "0");
    text.setAttribute("aria-label", `Linear: ${key}`);
    text.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      text.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    attachKeyTrigger(text as unknown as HTMLElement, ref(key), isEnabled);
  });
}

/**
 * Mermaid may draw after Markdown post-processors run, a section can hold more
 * than one diagram drawn at different times, and Obsidian's renderer redraws a
 * diagram (a new SVG) when its width changes. So `el` is watched for as long as
 * it exists, and every drawn flowchart in it is (re-)enriched; enriching is
 * idempotent. The observer goes with `el` once nothing references it.
 */
export function enrichMermaidWhenDrawn(el: HTMLElement): void {
  if (!el.querySelector(".mermaid, code.language-mermaid") && !el.classList.contains("mermaid")) return;
  const run = (): void => {
    if (!isEnabled()) { observer.disconnect(); return; }
    el.querySelectorAll(".mermaid svg").forEach(enrichMermaidLinearKeys);
  };
  const observer = new MutationObserver(run);
  run();
  observer.observe(el, { childList: true, subtree: true });
}
