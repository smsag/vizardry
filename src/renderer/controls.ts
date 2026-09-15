import { setIcon, MarkdownView, Platform, Notice } from "obsidian";
import type { App, MarkdownPostProcessorContext } from "obsidian";
import { applyFullWidth } from "./full-width";
import { onDisconnected, ownerWindow } from "../shared/lifecycle";
import { t } from "../i18n";
import { TITLE_MAX_LENGTH } from "../shared/title-edit";
import { getPluginVersion } from "../shared/version";
import type { LinkResolver } from "../shared/links";
import { attachSectionPreview } from "./section-preview";
import { writeCollapseState, writeStickyState } from "../shared/block-edit";
import { activateSticky, deactivateSticky } from "./sticky-pin";
import { createBlurGuard } from "./inline-edit";
import { renderLinearKeyBadge } from "../shared/linear-enrichment";
import { renderUpvotyKeyBadge } from "../shared/upvoty-enrichment";
import { bestTextColor } from "../shared/color-utils";
import { VizardryExportError } from "../shared/export-error";

let nextId = 0;

export function markInteractive(el: HTMLElement): void {
  el.dataset.vzdId = String(nextId++);
}

/**
 * html-to-image captures the container at its current on-screen size — which
 * on a narrow viewport (mobile especially) is only the *scrolled slice* of a
 * canvas wider or taller than the screen, so the export would drop everything
 * past the visible edge. Before capturing, expand the container and every
 * scrollable descendant to their full scroll size and drop the clipping
 * overflow; the returned callback restores the exact prior inline styles once
 * the capture is done.
 *
 * Elements are processed deepest-first (reverse document order, container
 * last) so a nested scroller is expanded before its ancestor is measured —
 * otherwise the ancestor, re-measured after a child grows, would still clip.
 * Only `auto`/`scroll` overflow is touched, never `hidden` (which is used for
 * decorative rounded-corner clipping). On desktop, where nothing overflows,
 * this finds no elements to change and is a no-op — so the export path is
 * unchanged there.
 */
export function expandForCapture(root: HTMLElement, win: Window): () => void {
  const saved: Array<{ el: HTMLElement; style: string | null }> = [];
  const expand = (el: HTMLElement): void => {
    const cs = win.getComputedStyle(el);
    const clipsX = (cs.overflowX === "auto" || cs.overflowX === "scroll") && el.scrollWidth > el.clientWidth + 1;
    const clipsY = (cs.overflowY === "auto" || cs.overflowY === "scroll") && el.scrollHeight > el.clientHeight + 1;
    if (!clipsX && !clipsY) return;
    saved.push({ el, style: el.getAttribute("style") });
    el.style.overflow = "visible";
    if (clipsX) { el.style.width = `${el.scrollWidth}px`; el.style.maxWidth = "none"; }
    if (clipsY) { el.style.height = `${el.scrollHeight}px`; el.style.maxHeight = "none"; }
  };
  const ordered = Array.from(root.querySelectorAll<HTMLElement>("*")).reverse();
  ordered.push(root);
  for (const el of ordered) expand(el);
  return () => {
    for (const { el, style } of saved) {
      if (style === null) el.removeAttribute("style");
      else el.setAttribute("style", style);
    }
  };
}

/**
 * Resets a Story or Journey column carousel back to its full grid. On a narrow
 * viewport the renderer collapses these to the active column via *inline* styles
 * (`display:none` on off-column cells, a narrowed `grid-template-columns`), which
 * a stylesheet can't reach — so the reveal is done in JS. Shared by presentation
 * mode (openPresentation → loadContent, on a throwaway clone) and the PNG export
 * (revealForCapture, on the live canvas). `grid` is the `.vzd-story-grid` /
 * `.vzd-journey-grid` element. `onTouch`, when given, is called with every element
 * just before it is mutated so a caller can snapshot it for later restore; the
 * presentation clone is discarded, so it passes nothing.
 */
function revealColumnCarousel(
  grid: HTMLElement,
  kind: "story" | "journey",
  onTouch?: (el: HTMLElement) => void,
): void {
  onTouch?.(grid);
  grid.style.gridTemplateColumns = "";
  if (kind === "story") {
    grid.querySelectorAll<HTMLElement>(".vzd-story-activity-header").forEach((el) => {
      onTouch?.(el);
      el.style.display = "";
      el.style.gridColumn = el.dataset.origGridCol ?? "";
    });
    grid.querySelectorAll<HTMLElement>(".vzd-story-step-header, .vzd-story-cell").forEach((el) => {
      onTouch?.(el);
      el.style.display = "";
      el.style.gridColumn = "";
    });
  } else {
    grid.querySelectorAll<HTMLElement>(".vzd-journey-lane-cells").forEach((el) => {
      onTouch?.(el);
      el.style.gridTemplateColumns = "";
    });
    grid.querySelectorAll<HTMLElement>(".vzd-journey-phase-header, .vzd-journey-cell").forEach((el) => {
      onTouch?.(el);
      el.style.display = "";
      el.style.gridColumn = "";
    });
  }
}

/**
 * Companion to {@link expandForCapture} for the PNG export. On a narrow (mobile)
 * viewport several canvases don't scroll — they collapse into a *carousel* that
 * shows only the active panel: the grid frameworks and the Roadmap / Pace-Layers
 * stacks hide every non-active panel behind `visibility:hidden` in a single
 * stacked cell, and Story / Journey maps collapse to the active column. That
 * clipping is layout, not overflow, so `expandForCapture` alone would still
 * export just the on-screen panel — the reported "only the visible part is
 * saved" bug for carousel canvases.
 *
 * This reveals the whole canvas the way presentation mode does: a
 * `vizardry-capturing` class re-establishes the real grid and un-hides every
 * panel (CSS, via the `--vzd-*` custom props the renderer stamps on the
 * grid/blocks — see styles.css), and the Story / Journey column carousels are
 * reset via the shared {@link revealColumnCarousel}. A canvas minimized via
 * `collapsed: true` is expanded, and the pinned tint dropped. Every mutation is
 * snapshotted so the returned callback restores the exact prior markup after
 * capture. On desktop, for an expanded canvas, this changes no computed layout —
 * a no-op, leaving that export path unchanged.
 */
export function revealForCapture(container: HTMLElement): () => void {
  const saved: Array<{ el: HTMLElement; style: string | null; cls: string | null }> = [];
  const touch = (el: HTMLElement): void => {
    saved.push({ el, style: el.getAttribute("style"), cls: el.getAttribute("class") });
  };

  // Grid frameworks, Roadmap and Pace Layers: the class alone restores the real
  // grid and un-hides every panel (the `.vizardry-capturing` rules in
  // styles.css) — no per-panel bookkeeping needed.
  touch(container);
  container.classList.add("vizardry-capturing");

  // A canvas saved with `collapsed: true` renders minimized — everything but
  // the header is `display: none` (styles.css) — so capturing it as-is would
  // yield a bare title bar rather than the drawing. Same for the pinned state,
  // whose header tint is a reading affordance, not content. Both are class-only,
  // so the snapshot above restores them.
  container.classList.remove("vizardry-canvas--minimized", "vizardry-canvas--sticky");

  // Story / Journey collapse via inline styles a stylesheet can't reach.
  const story = container.querySelector<HTMLElement>(".vzd-story-grid");
  if (story) revealColumnCarousel(story, "story", touch);
  const journey = container.querySelector<HTMLElement>(".vzd-journey-grid");
  if (journey) revealColumnCarousel(journey, "journey", touch);

  return () => {
    for (const { el, style, cls } of saved) {
      if (style === null) el.removeAttribute("style");
      else el.setAttribute("style", style);
      if (cls === null) el.removeAttribute("class");
      else el.setAttribute("class", cls);
    }
  };
}

/**
 * Interaction chrome that must never appear in the exported PNG: the header
 * toolbar, the mobile carousel navs, and every inline editing affordance
 * (add / delete / unlink buttons and SVG drag-handles). Some of these are
 * hover-gated — so absent from a desktop capture, which has no hover — but
 * others are deliberately always-visible so they work on touch (see the
 * "no hover gating, so they work on touch/mobile too" affordances in
 * styles.css), which is why they leak into a mobile export. Only the top-level
 * container class of each affordance is listed: html-to-image's `filter` skips
 * a node's whole subtree, so excluding the wrapper drops its inner
 * circle/icon/× parts too. Link indicators (vzd-card-link-btn,
 * vizardry-block-link-btn) are intentionally kept — they mark a link rather
 * than edit, and read fine in a static image.
 */
const EXPORT_CHROME_CLASSES: ReadonlySet<string> = new Set([
  "vizardry-header-actions",
  // Mobile carousel navigation
  "vizardry-nav", "vzd-story-nav", "vzd-journey-nav",
  // Inline add / delete / unlink affordances (HTML buttons)
  "vzd-scqa-card-add", "vzd-scqa-card-del",
  "vzd-roadmap-add-item", "vzd-sipoc-add-row",
  "vzd-journey-card-delete", "vzd-journey-add-card",
  "vzd-story-task-delete", "vzd-story-add-task",
  "vzd-nodemap-box-delete-btn",
  "vzd-compass-del", "vzd-compass-add",
  // SVG affordances (the wrapping <g> / text element carries the class)
  "vzd-wardley-unlink-btn", "vzd-wardley-add-handle-g",
  "vzd-nodemap-unlink-btn", "vzd-nodemap-add-handle-g",
  "vzd-tree-edit-add", "vzd-tree-edit-del",
  "vzd-lane-bullet-add", "vzd-lane-bullet-del",
  // Flow canvas (Problem) live-edit affordances
  "vzd-flow-card-delete", "vzd-flow-add",
]);

/** True when `node` is interaction chrome to omit from the exported image. */
function isExportChrome(node: Node): boolean {
  const cl = (node as Element).classList;
  if (!cl) return false; // text nodes and the like have no classList
  for (const c of EXPORT_CHROME_CLASSES) if (cl.contains(c)) return true;
  return false;
}

/** The canvas's own title row, set up by `initCanvas`. */
function isCanvasTitleRow(node: Node): boolean {
  const cl = (node as Element).classList;
  return !!cl && cl.contains("vizardry-header");
}

/** Default ceiling on the longer edge of a capture, in pixels. */
export const DEFAULT_MAX_EDGE = 8000;

/** Lowest scale we fall back to before declaring a canvas too large to capture. */
export const MIN_CAPTURE_SCALE = 0.25;

/** Marks an element whose text colour is chosen against its own rendered background. */
export const AUTO_TEXT_ATTR = "data-vzd-autotext";

/** Fully resolved capture inputs. The public API normalises; the button fills its own in. */
export interface CaptureOptions {
  /** Device pixels per CSS pixel. Reduced if `maxEdge` would be exceeded. */
  scale: number;
  /** Hard ceiling on the longer edge after scaling. */
  maxEdge: number;
  /** Capture as if the light theme were active, whatever the vault uses. */
  light: boolean;
  /** Colour painted behind the canvas. */
  background: string;
  /** Keep the canvas's own title row. */
  header: boolean;
}

export interface CaptureOutcome {
  blob: Blob;
  /** Actual pixel dimensions of the returned image. */
  width: number;
  height: number;
  /** The scale actually used — below `options.scale` when `maxEdge` bit. */
  scale: number;
}

/**
 * Swap the canvas root onto the light palette for the duration of a capture.
 *
 * Obsidian defines its colours on `.theme-light` / `.theme-dark` and Vizardry's
 * own stylesheet has no theme-scoped rules, so the nearest ancestor that defines
 * a variable wins — putting the class on the root reaches every descendant
 * without a second, hand-maintained palette to keep in step with the app.
 */
function forceLightTheme(root: HTMLElement): () => void {
  const hadLight = root.classList.contains("theme-light");
  const hadDark = root.classList.contains("theme-dark");
  root.classList.add("theme-light");
  root.classList.remove("theme-dark");
  return () => {
    if (!hadLight) root.classList.remove("theme-light");
    if (hadDark) root.classList.add("theme-dark");
  };
}

/**
 * Paint and text properties an SVG child needs carried as an inline style for
 * the capture. Deliberately not `filter`: the sketch-mode wobble is a
 * `url(#vzd-sketch-rough)` reference to defs that do not exist inside the
 * serialized clone, and an unresolvable filter reference means the element is
 * not rendered at all — losing the wobble is acceptable, losing the drawing is
 * not. Inherited-only properties are still listed because a class can set them
 * on a single node (a smaller stage label, say), and inheritance alone would
 * carry the wrong value.
 */
const SVG_CAPTURE_PROPS: readonly string[] = [
  "fill", "fill-opacity", "fill-rule",
  "stroke", "stroke-width", "stroke-opacity", "stroke-dasharray",
  "stroke-dashoffset", "stroke-linecap", "stroke-linejoin", "stroke-miterlimit",
  "opacity", "color", "display", "visibility", "paint-order", "mix-blend-mode",
  "font-family", "font-size", "font-weight", "font-style", "letter-spacing",
];

/**
 * Inline the computed paint of every element inside an `<svg>`, for the
 * duration of the capture.
 *
 * html-to-image deep-clones an `<svg>` in one step and only applies computed
 * styles to the node it cloned — never to its descendants — and the clone is
 * serialized into a standalone document where this plugin's stylesheet does not
 * apply. Every SVG child therefore falls back to SVG's initial values: black
 * fill, full opacity, no stroke. That is why an exported Wardley map arrived
 * with solid black evolution bands, and why the text looked right (SVG's
 * default fill is black) while the shapes did not.
 *
 * Copying the computed values onto the elements themselves puts the paint
 * somewhere the clone carries. The snapshot restores each element's exact prior
 * inline style, so the live canvas is untouched.
 */
function inlineSvgStyles(root: HTMLElement): () => void {
  const saved: Array<{ el: SVGElement; style: string | null }> = [];
  const win = ownerWindow(root);
  // Read every computed value first, then write: interleaving a write with the
  // next element's read invalidates inherited style for the subtree and forces
  // a recalc per element — quadratic on a large Wardley or tree SVG.
  const pending: Array<{ el: SVGElement; values: Array<[string, string]> }> = [];
  for (const el of Array.from(root.querySelectorAll<SVGElement>("svg, svg *"))) {
    // `style` is absent on a few SVG nodes (e.g. <title>); skip rather than throw.
    if (!el.style) continue;
    const computed = win.getComputedStyle(el);
    const values: Array<[string, string]> = [];
    for (const prop of SVG_CAPTURE_PROPS) {
      const value = computed.getPropertyValue(prop);
      if (value) values.push([prop, value]);
    }
    pending.push({ el, values });
  }
  for (const { el, values } of pending) {
    saved.push({ el, style: el.getAttribute("style") });
    for (const [prop, value] of values) el.style.setProperty(prop, value);
  }
  return () => {
    for (const { el, style } of saved) {
      if (style === null) el.removeAttribute("style");
      else el.setAttribute("style", style);
    }
  };
}

/**
 * Re-decide the text colours that were chosen at *render* time against the
 * then-current background (see {@link bestTextColor}): a SIPOC Process header
 * or a Roadmap column header rendered in a dark vault has white baked into its
 * inline style, which on the light ground of a forced-light capture would be
 * invisible.
 *
 * Must run **after** {@link forceLightTheme} — `bestTextColor` reads each
 * element's own computed background, so re-resolving first would read the dark
 * mix, bake white again, and then capture it on light. And after the reveal: a
 * minimized canvas hides its body, and a hidden element has no background worth
 * measuring.
 */
function reresolveAutoText(root: HTMLElement): () => void {
  const saved: Array<{ el: HTMLElement; color: string }> = [];
  for (const el of Array.from(root.querySelectorAll<HTMLElement>(`[${AUTO_TEXT_ATTR}]`))) {
    saved.push({ el, color: el.style.color });
    el.style.color = bestTextColor(el);
  }
  return () => {
    for (const { el, color } of saved) el.style.color = color;
  };
}

/**
 * Put a live canvas into the state it should be captured in, and return the
 * callback that puts it back. Order is the contract:
 *
 *   1. reveal   — un-collapse, un-carousel (a hidden panel exports as nothing)
 *   2. light    — swap the root onto the light palette
 *   3. re-resolve — re-decide the colours that were baked at render time
 *   4. inline SVG paint — put it where the capture's clone can carry it
 *
 * Step 2 before step 3 because those colours are chosen against the element's
 * own background; step 1 before both because a minimized canvas has no visible
 * body to measure. Exported so the visual harness can show exactly what a
 * capture would contain without going through html-to-image.
 */
export function prepareForCapture(root: HTMLElement, options: { light: boolean }): () => void {
  const restore: Array<() => void> = [];
  const undo = (): void => {
    for (let i = restore.length - 1; i >= 0; i--) restore[i]();
  };
  try {
    // On mobile the "only the visible part is saved" bug has two causes, so undo
    // both before sizing the capture: reveal any carousel-collapsed or minimized
    // panels here, then expand the scroll wrappers (the caller's next step) so the
    // *whole* canvas is measured, not just the on-screen slice.
    restore.push(revealForCapture(root));
    if (options.light) {
      restore.push(forceLightTheme(root));
      restore.push(reresolveAutoText(root));
    }
    // Last: it reads computed values, so everything that changes them — the
    // reveal, the light palette, the re-resolved text colours — has to be in
    // place first.
    restore.push(inlineSvgStyles(root));
  } catch (err) {
    // Never leave a half-prepared canvas on screen: the caller has no restore
    // callback to call if this throws before returning one.
    undo();
    throw err;
  }
  return undo;
}

// Captures are serialised through one chain. Every step mutates the *live*
// canvas and restores it by rewriting whole `style` / `class` attributes, so two
// overlapping captures would interleave their snapshots and the second restore
// would put back the first one's mutations. The download button self-serialises
// by disabling itself; the public API has no such guard, and a caller printing a
// note walks every canvas in it.
let captureChain: Promise<unknown> = Promise.resolve();

/**
 * Capture one rendered canvas to a PNG blob — the single path behind both the
 * download button and `api.exportCanvas`.
 *
 * {@link prepareForCapture} → expand to full scroll size and measure → capture →
 * restore in reverse. The order is part of the contract; see there.
 */
export function captureCanvas(root: HTMLElement, options: CaptureOptions): Promise<CaptureOutcome> {
  const run = (): Promise<CaptureOutcome> => runCapture(root, options);
  // `then(run, run)` so one caller's failure doesn't sink the queue behind it.
  const next = captureChain.then(run, run);
  captureChain = next.then(() => undefined, () => undefined);
  return next;
}

async function runCapture(root: HTMLElement, options: CaptureOptions): Promise<CaptureOutcome> {
  if (!root.isConnected) {
    throw new VizardryExportError(
      "not-rendered",
      "The canvas is not in the document, so it has no layout to capture. Render it into a visible (or offscreen but laid out) host first.",
    );
  }
  // Lazy-load html-to-image so its initialisation cost is deferred to the first
  // capture rather than paid at plugin startup. esbuild's CJS __commonJS factory
  // means the module code runs on first require(), not at bundle eval.
  const { toBlob } = await import("html-to-image");
  const win = ownerWindow(root);
  const restore: Array<() => void> = [];
  try {
    restore.push(prepareForCapture(root, options));
    restore.push(expandForCapture(root, win));

    // `|| offset*` keeps a test/jsdom-style environment that reports no scroll
    // size from collapsing the capture to zero.
    const cssWidth = root.scrollWidth || root.offsetWidth;
    const cssHeight = root.scrollHeight || root.offsetHeight;
    const longerEdge = Math.max(cssWidth, cssHeight);
    let scale = options.scale;
    if (longerEdge > 0) {
      const fitted = options.maxEdge / longerEdge;
      if (fitted < MIN_CAPTURE_SCALE) {
        throw new VizardryExportError(
          "too-large",
          `The canvas is ${longerEdge} CSS px on its longer edge, which cannot be captured within a ${options.maxEdge} px limit even at the lowest scale.`,
        );
      }
      // Shrink rather than refuse: a slightly soft picture beats none at all in
      // a document, and the caller is told which scale it actually got.
      if (fitted < scale) scale = fitted;
    }

    let blob: Blob | null;
    try {
      // Render to a Blob rather than a data: URL — base64 data URLs can exceed
      // the WebView's URL-length cap and fail silently on large canvases.
      blob = await toBlob(root, {
        pixelRatio: scale,
        backgroundColor: options.background,
        // `|| undefined` lets html-to-image fall back to the element's own size
        // when layout isn't measurable.
        width: cssWidth || undefined,
        height: cssHeight || undefined,
        // Strip interaction chrome (toolbar, carousel nav, inline edit
        // affordances) so the exported image is content-only, and the canvas's
        // own title row when the caller supplies its own caption.
        filter: (node) => !isExportChrome(node) && (options.header || !isCanvasTitleRow(node)),
      });
    } catch (err) {
      throw new VizardryExportError("capture-failed", "Rendering the canvas to an image failed.", err);
    }
    if (!blob) throw new VizardryExportError("capture-failed", "Rendering the canvas to an image produced no data.");

    return {
      blob,
      width: Math.round(cssWidth * scale),
      height: Math.round(cssHeight * scale),
      scale,
    };
  } finally {
    for (let i = restore.length - 1; i >= 0; i--) restore[i]();
  }
}

/**
 * If `label` resolves to a heading in the current note, appends a chain-link
 * button to `parent` that jumps to it. Shared by the card canvases (card
 * blocks, Story, SCQA grid) so a linked card gets the same affordance the grid
 * boxes, roadmap cards, and tree nodes already have. Falls back to an explicit
 * Linear/Upvoty ticket badge when no heading matches but the label carries a
 * `[label](CORE-1234)`-style annotation. No-op when neither resolves.
 */
export function renderHeadingLink(
  parent: HTMLElement,
  label: string,
  resolver: LinkResolver | undefined,
  navigateTo: ((heading: string) => void) | undefined,
  app?: App,
  sourcePath?: string,
): void {
  // Explicit `[text](canvas:Title)` — jump to another canvas in the same note.
  // Checked before heading auto-detect so an explicit canvas link isn't stolen
  // by a heading that happens to share the label's text.
  const canvasTitle = resolver?.resolveCanvas?.(label);
  if (canvasTitle && app && sourcePath) {
    const linkBtn = parent.createEl("button", { cls: "vzd-card-link-btn vzd-card-canvas-link-btn vzd-btn" });
    setIcon(linkBtn, "layout-grid");
    linkBtn.setAttribute("aria-label", t("nav.jumpToCanvas", { title: canvasTitle }));
    linkBtn.dataset.canvasTitle = canvasTitle;
    markInteractive(linkBtn);
    linkBtn.addEventListener("click", (e) => { e.stopPropagation(); navigateToCanvas(app, sourcePath, canvasTitle); });
    return;
  }

  const heading = resolver?.resolve(label);
  if (heading && navigateTo) {
    const linkBtn = parent.createEl("button", { cls: "vzd-card-link-btn vzd-btn" });
    setIcon(linkBtn, "link");
    linkBtn.setAttribute("aria-label", t("nav.jumpTo", { heading }));
    linkBtn.dataset.heading = heading;
    markInteractive(linkBtn);
    linkBtn.addEventListener("click", (e) => { e.stopPropagation(); navigateTo(heading); });

    // Cmd/Ctrl-hover (desktop) or long-press (mobile) shows a clipped preview of
    // the linked section on the whole box/card.
    if (app && sourcePath) attachSectionPreview(app, parent, heading, sourcePath);
    return;
  }

  const ticket = resolver?.resolveTicket?.(label);
  if (ticket) {
    if (ticket.service === "linear") renderLinearKeyBadge(parent, ticket.key);
    else renderUpvotyKeyBadge(parent, ticket.key);
  }
}

/**
 * Scrolls to another canvas in the same note by its title and flashes it. The
 * target `.vizardry-canvas` carries `data-canvas-title` (set in initCanvas); we
 * prefer the pane showing `sourcePath`, then fall back to any matching canvas in
 * the document. Shows a Notice when no canvas with that title is rendered.
 */
export function navigateToCanvas(app: App, sourcePath: string, title: string): void {
  const key = title.toLowerCase().trim();
  const findIn = (root: ParentNode | null | undefined): HTMLElement | null => {
    if (!root) return null;
    for (const el of Array.from(root.querySelectorAll<HTMLElement>(".vizardry-canvas[data-canvas-title]"))) {
      if (el.dataset.canvasTitle === key) return el;
    }
    return null;
  };

  let target: HTMLElement | null = null;
  for (const leaf of app.workspace.getLeavesOfType("markdown")) {
    const view = leaf.view;
    if (view instanceof MarkdownView && view.file?.path === sourcePath) {
      target = findIn(view.containerEl);
      if (target) break;
    }
  }
  target ??= findIn(document);

  if (!target) {
    new Notice(t("nav.canvasNotFound", { title }));
    return;
  }
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  target.addClass("vizardry-canvas--jump-flash");
  ownerWindow(target).setTimeout(() => target?.removeClass("vizardry-canvas--jump-flash"), 1200);
}

/**
 * Reset the interactive-element ID counter.
 * Must be called from VizardryPlugin.onunload() so that a plugin reload
 * (e.g. via Hot Reload) starts fresh — otherwise presentation-mode click
 * rebinding silently fails because the new canvas IDs do not match the
 * IDs already burned into the cloned DOM from the previous load.
 */
export function resetInteractiveIdCounter(): void {
  nextId = 0;
}

/**
 * Renders a small, non-blocking warning chip in the canvas header for
 * recoverable parse issues (empty labels, skipped mis-nested lines). Clicking
 * it toggles a detail list. No-op when there are no warnings. Reusable across
 * frameworks that surface `warnings` from their parser.
 */
export function renderCanvasWarnings(container: HTMLElement, warnings?: string[]): void {
  if (!warnings || warnings.length === 0) return;
  const header = container.querySelector<HTMLElement>(".vizardry-header");
  if (!header) return;

  const chip = header.createEl("button", { cls: "vzd-canvas-warning-chip vzd-btn" });
  chip.setAttribute("aria-label", `${warnings.length} rendering ${warnings.length === 1 ? "warning" : "warnings"} — click for details`);
  chip.setAttribute("title", warnings.join("\n"));
  chip.createEl("span", { cls: "vzd-canvas-warning-icon", text: "⚠" });
  chip.createEl("span", { cls: "vzd-canvas-warning-count", text: String(warnings.length) });

  // Sit the chip just before the action buttons (i.e. after the title).
  const actions = header.querySelector(".vizardry-header-actions");
  if (actions) header.insertBefore(chip, actions);

  let detail: HTMLElement | null = null;
  chip.addEventListener("click", (e) => {
    e.stopPropagation();
    if (detail) { detail.remove(); detail = null; chip.classList.remove("is-open"); return; }
    detail = container.createEl("div", { cls: "vzd-canvas-warning-detail" });
    header.insertAdjacentElement("afterend", detail);
    const list = detail.createEl("ul");
    for (const w of warnings) list.createEl("li", { text: w });
    chip.classList.add("is-open");
  });
}

export function initCanvas(
  container: HTMLElement,
  frameworkId: string,
  title: string,
  extraHeaderContent?: (header: HTMLElement) => void,
  source?: string,
  onTitleEdit?: (newTitle: string) => void,
  app?: App,
  ctx?: MarkdownPostProcessorContext,
): void {
  container.addClass("vizardry-canvas");
  container.setAttribute("data-framework", frameworkId);
  // Anchor for same-note canvas links (`[text](canvas:Title)`): the canvas is
  // findable by its (normalised) title. See navigateToCanvas / renderHeadingLink.
  container.dataset.canvasTitle = title.toLowerCase().trim();
  // Store the raw source so resolveEditor can locate this block by content
  // scan when ctx.getSectionInfo() returns null (e.g. in Live Preview mode).
  // Without this, inline edits fail to save in Live Edit ("Edit could not be
  // saved — open the note in editing mode").
  if (source !== undefined) container.dataset.vzSource = source;
  container.style.width = "100%";
  container.style.minWidth = "100%";
  container.style.boxSizing = "border-box";
  ownerWindow(container).requestAnimationFrame(() => applyFullWidth(container));

  // Restore collapsed state from source (written back by the minimize button).
  const isCollapsed = source !== undefined &&
    source.split("\n").some(l => l.trim().toLowerCase() === "collapsed: true");
  if (isCollapsed) container.addClass("vizardry-canvas--minimized");

  // Restore sticky/pin state from source (written back by the pin button).
  const isSticky = source !== undefined &&
    source.split("\n").some(l => l.trim().toLowerCase() === "sticky: true");

  const header = container.createEl("div", { cls: "vizardry-header" });

  if (onTitleEdit) {
    renderEditableTitle(header, title, onTitleEdit);
  } else {
    header.createEl("span", { text: title, cls: "vizardry-title" });
  }

  // Every canvas is authored under the single ```vizardry fence now (the
  // `type:` line inside `source` identifies the framework), regardless of
  // what `frameworkId` is used for elsewhere (data-framework, diagnostics).
  const fence = '```';
  const copyText = source !== undefined
    ? fence + 'vizardry' + '\n' + source + '\n' + fence
    : undefined;
  addHeaderControls(header, container, title, copyText, app, ctx, isCollapsed, isSticky);
  extraHeaderContent?.(header);
}

function renderEditableTitle(header: HTMLElement, title: string, onTitleEdit: (newTitle: string) => void): void {
  const span = header.createEl("span", { text: title, cls: "vizardry-title vizardry-title--editable" });
  span.setAttribute("title", t("title.clickToEdit"));

  span.addEventListener("click", (e) => {
    e.stopPropagation();
    if (span.classList.contains("vizardry-title--editing")) return;

    span.classList.add("vizardry-title--editing");
    span.setAttribute("contenteditable", "true");
    span.setAttribute("spellcheck", "false");
    span.focus({ preventScroll: true });

    // Ignore the blur Obsidian's CM6 Live Preview fires by stealing focus back
    // right after .focus() — without this, that spurious blur commits the edit
    // before the user has typed a single character, reverting the title to its
    // current value (the framework name on an untitled canvas). Same guard the
    // shared inline-edit input uses.
    const guard = createBlurGuard();

    // Place cursor at end
    const range = span.ownerDocument.createRange();
    range.selectNodeContents(span);
    range.collapse(false);
    const sel = ownerWindow(span).getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);

    const teardown = (): void => {
      guard.dispose();
      span.classList.remove("vizardry-title--editing");
      span.removeAttribute("contenteditable");
      span.removeAttribute("spellcheck");
      span.removeEventListener("keydown", onKeyDown);
      span.removeEventListener("blur", onBlur);
    };

    const commit = (): void => {
      if (!span.classList.contains("vizardry-title--editing")) return;
      teardown();
      const newTitle = (span.textContent ?? "").trim().slice(0, TITLE_MAX_LENGTH) || title;
      span.textContent = newTitle;
      onTitleEdit(newTitle);
    };

    const cancel = (): void => {
      if (!span.classList.contains("vizardry-title--editing")) return;
      teardown();
      span.textContent = title;
    };

    const onKeyDown = (ev: KeyboardEvent): void => {
      if (ev.key === "Enter") { ev.preventDefault(); commit(); }
      if (ev.key === "Escape") { ev.preventDefault(); cancel(); }
    };

    const onBlur = (): void => {
      if (guard.ignoreBlur()) return; // spurious CM6 focus-steal, not a real blur
      commit();
    };

    span.addEventListener("keydown", onKeyDown);
    span.addEventListener("blur", onBlur);
  });
}

export function addHeaderControls(
  header: HTMLElement,
  container: HTMLElement,
  title: string,
  copyText?: string,
  app?: App,
  ctx?: MarkdownPostProcessorContext,
  initiallyCollapsed = false,
  initiallySticky = false,
): void {
  const actions = header.createEl("div", { cls: "vizardry-header-actions" });

  const STEP_PX = 2, MIN_STEP = -3, MAX_STEP = 6;
  let step = 0;

  const decreaseBtn = actions.createEl("button", { cls: "vizardry-font-btn vzd-btn" }) as HTMLButtonElement;
  setIcon(decreaseBtn, "minus");
  decreaseBtn.setAttribute("aria-label", t("controls.decreaseFontSize"));

  const increaseBtn = actions.createEl("button", { cls: "vizardry-font-btn vzd-btn" }) as HTMLButtonElement;
  setIcon(increaseBtn, "plus");
  increaseBtn.setAttribute("aria-label", t("controls.increaseFontSize"));

  const applyStep = (): void => {
    if (step === 0) {
      container.style.removeProperty("--vzd-base");
    } else {
      container.style.setProperty("--vzd-base", `calc(var(--vzd-base-default) + ${step * STEP_PX}px)`);
    }
    decreaseBtn.disabled = step <= MIN_STEP;
    increaseBtn.disabled = step >= MAX_STEP;
  };

  decreaseBtn.addEventListener("click", (e) => { e.stopPropagation(); if (step > MIN_STEP) { step--; applyStep(); } });
  increaseBtn.addEventListener("click", (e) => { e.stopPropagation(); if (step < MAX_STEP) { step++; applyStep(); } });
  applyStep();

  const editSourceBtn = actions.createEl("button", { cls: "vizardry-edit-source-btn vzd-btn" }) as HTMLButtonElement;
  setIcon(editSourceBtn, "code");
  editSourceBtn.setAttribute("aria-label", t("controls.editSource"));
  editSourceBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    // In Live Preview the canvas lives inside a .cm-embed-block wrapper that
    // has a native "Edit block" button — delegate to that to avoid
    // re-implementing the CM6 toggle.
    const embedBlock = container.closest(".cm-embed-block");
    const nativeBtn = embedBlock?.querySelector<HTMLElement>(".edit-block-button");
    if (nativeBtn) {
      nativeBtn.click();
    } else if (app) {
      // In Read mode there is no CM6 embed wrapper. Switch to Live Preview so
      // the user lands in the editable view with the code block visible.
      const view = app.workspace.getActiveViewOfType(MarkdownView);
      if (view) void view.setState({ ...view.getState(), mode: "source" }, { history: false });
    }
  });

  const downloadBtn = actions.createEl("button", { cls: "vizardry-download-btn vzd-btn" }) as HTMLButtonElement;
  setIcon(downloadBtn, "download");
  downloadBtn.setAttribute("aria-label", t("controls.downloadPng"));

  const handleDownload = async (): Promise<void> => {
    downloadBtn.disabled = true;
    try {
      // Derive doc/window from the container itself — it may live in a
      // pop-out Obsidian window, which has its own theme styles and DPI.
      const doc = container.ownerDocument;
      const win = doc.defaultView ?? window;
      // Read the background off the canvas, not the body: a custom property
      // inherits, so this picks up any theme scoping between the two.
      const bg = win.getComputedStyle(container).getPropertyValue("--background-primary").trim() || "#ffffff";
      // Cap the pixel ratio: unchanged on desktop, but bounded on high-DPI
      // phones where devicePixelRatio*2 (≈6) makes oversized PNGs that can OOM.
      const pixelRatio = Math.min((win.devicePixelRatio || 1) * 2, 4);
      // Same capture path the public API uses (src/renderer/export-api.ts); the
      // button keeps the vault's own theme and its title row, and owns delivery
      // — filename, share sheet, download anchor — from here on.
      const { blob } = await captureCanvas(container, {
        scale: pixelRatio,
        maxEdge: DEFAULT_MAX_EDGE,
        light: false,
        background: bg,
        header: true,
      });

      const filename = `${safeFilename(title)}.png`;

      // Mobile WebViews (iOS/Android) ignore the <a download> attribute, so
      // hand the PNG to the system share sheet (Save to Photos/Files) via the
      // Web Share API instead.
      const nav = win.navigator as Navigator & {
        share?: (data: { files?: File[]; title?: string }) => Promise<void>;
        canShare?: (data: { files?: File[] }) => boolean;
      };
      if (Platform.isMobile && typeof nav.share === "function") {
        const file = new File([blob], filename, { type: "image/png" });
        if (!nav.canShare || nav.canShare({ files: [file] })) {
          try {
            await nav.share({ files: [file], title });
            return;
          } catch (err) {
            // The user dismissing the share sheet is not a failure.
            if ((err as Error)?.name === "AbortError") return;
            throw err;
          }
        }
      }

      // Desktop (and any platform without file sharing): object URL + a real,
      // in-document anchor. A blob URL sidesteps the data: length limit, and
      // attaching the anchor before clicking makes the synthetic click fire
      // reliably (a detached anchor is ignored by some engines).
      const url = URL.createObjectURL(blob);
      const a = doc.createElement("a");
      a.href = url;
      a.download = filename;
      a.rel = "noopener";
      doc.body.appendChild(a);
      a.click();
      a.remove();
      // Revoke on a later tick so the download has grabbed the URL first.
      win.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (err) {
      console.error(`Vizardry v${getPluginVersion()}: PNG export failed`, err);
    } finally {
      downloadBtn.disabled = false;
    }
  };

  downloadBtn.addEventListener("click", (e) => { e.stopPropagation(); void handleDownload(); });
  if (copyText !== undefined) {
    const copyBtn = actions.createEl("button", { cls: "vizardry-copy-btn vzd-btn" }) as HTMLButtonElement;
    setIcon(copyBtn, "copy");
    copyBtn.setAttribute("aria-label", t("controls.copySource"));
    copyBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      void navigator.clipboard.writeText(copyText).then(() => {
        setIcon(copyBtn, "check");
        setTimeout(() => setIcon(copyBtn, "copy"), 1000);
      }).catch(err => {
        console.error(`Vizardry v${getPluginVersion()}: copy failed`, err);
      });
    });
  }

  const presentBtn = actions.createEl("button", { cls: "vizardry-present-btn vzd-btn" });
  setIcon(presentBtn, "expand");
  presentBtn.setAttribute("aria-label", t("controls.presentFullscreen"));
  presentBtn.addEventListener("click", (e) => { e.stopPropagation(); openPresentation(container, title); });

  // Separator, then the pin + minimize buttons — always last in the action bar.
  actions.createEl("span", { cls: "vzd-btn-separator" });

  // Pin (sticky) button — sits immediately left of minimize. Pinning only does
  // anything in Reading View on desktop, so the button is hidden elsewhere; the
  // visibility decision waits a frame for the canvas to attach to its view.
  let sticky = initiallySticky;
  const pinBtn = actions.createEl("button", { cls: "vzd-pin-btn vzd-btn" }) as HTMLButtonElement;
  pinBtn.style.display = "none";
  const syncPinBtn = (): void => {
    setIcon(pinBtn, sticky ? "pin-off" : "pin");
    pinBtn.classList.toggle("is-active", sticky);
    pinBtn.setAttribute("aria-label", t(sticky ? "controls.unpin" : "controls.pin"));
  };
  syncPinBtn();
  pinBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    sticky = !sticky;
    syncPinBtn();
    container.toggleClass("vizardry-canvas--sticky", sticky);
    if (sticky) activateSticky(container); else deactivateSticky(container);
    if (app && ctx) void writeStickyState(app, ctx, container, sticky);
  });
  ownerWindow(container).requestAnimationFrame(() => {
    const canPin = Platform.isDesktop &&
      !!container.closest(".markdown-reading-view") &&
      !container.closest(".cm-editor");
    pinBtn.style.display = canPin ? "" : "none";
    if (canPin && sticky) {
      container.addClass("vizardry-canvas--sticky");
      activateSticky(container);
    }
  });

  let collapsed = initiallyCollapsed;
  const minimizeBtn = actions.createEl("button", { cls: "vzd-minimize-btn vzd-btn" });
  setIcon(minimizeBtn, collapsed ? "chevron-down" : "chevron-up");
  minimizeBtn.setAttribute("aria-label", t(collapsed ? "controls.expand" : "controls.minimize"));
  minimizeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    collapsed = !collapsed;
    container.toggleClass("vizardry-canvas--minimized", collapsed);
    setIcon(minimizeBtn, collapsed ? "chevron-down" : "chevron-up");
    minimizeBtn.setAttribute("aria-label", t(collapsed ? "controls.expand" : "controls.minimize"));
    if (app && ctx) void writeCollapseState(app, ctx, container, collapsed);
  });
}

/** A title as a filename: path separators and reserved characters become "-". */
export function safeFilename(title: string): string {
  return title.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-").replace(/^\.+/, "").trim() || "canvas";
}

/**
 * The brief inline "could not save" notice tree-style canvases show under the
 * canvas rather than as a modal Notice. Three renderers carried a copy each.
 */
export function showWriteFailedNotice(container: HTMLElement): void {
  const notice = container.createEl("div", { cls: "vzd-tree-write-notice", text: t("tree.writeFailed") });
  ownerWindow(container).setTimeout(() => notice.remove(), 3000);
}

function openPresentation(sourceContainer: HTMLElement, title: string): void {
  // Use the source container's own document — it may live in a pop-out
  // Obsidian window, and the overlay must render there, not in the main window.
  const doc = sourceContainer.ownerDocument;
  const overlay = doc.body.createEl("div", { cls: "vzd-presentation-overlay" });
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", title);
  const previouslyFocused = doc.activeElement as HTMLElement | null;

  const pHeader = overlay.createEl("div", { cls: "vzd-presentation-header" });
  pHeader.createEl("span", { text: title, cls: "vzd-presentation-title" });
  const btnGroup = pHeader.createEl("div", { cls: "vzd-presentation-btn-group" });

  const reloadBtn = btnGroup.createEl("button", { cls: "vzd-presentation-reload vzd-btn" });
  setIcon(reloadBtn, "refresh-cw");
  reloadBtn.setAttribute("aria-label", t("controls.reloadCanvas"));

  const closeBtn = btnGroup.createEl("button", { cls: "vzd-presentation-close vzd-btn" });
  setIcon(closeBtn, "x");
  closeBtn.setAttribute("aria-label", t("controls.exitPresentation"));

  const wrap = overlay.createEl("div", { cls: "vzd-presentation-wrap" });

  const loadContent = (): void => {
    wrap.empty();
    // Covers all canvas types: grid, story, venn, ost, mindmap, impact
    const contentEl = sourceContainer.querySelector<HTMLElement>(
      ".vizardry-grid, .vzd-story-grid, .vzd-venn-wrap, .vizardry-ost-wrapper, .vizardry-mindmap-wrapper, .vizardry-impact-wrapper, .vzd-fishbone-wrap, .vzd-sipoc-wrap, .vzd-wardley-wrap, .vzd-roadmap-grid, .vzd-pl-stack, .vzd-mx-wrap, .vzd-cmap-wrap, .vzd-tc, .vzd-compass, .vzd-scqa-scroll, .vizardry-scqa-wrapper, .vzd-journey-grid, .vzd-nodemap-wrap, .vzd-wol-wrap, .vzd-odyssey-grid, .vzd-coi-wrap, .vzd-wp-wrap, .vzd-radar-wrap, .vzd-strategy-wrap, .vzd-utility-wrap, .vzd-flow-wrap"
    );
    if (!contentEl) return;

    const clone = contentEl.cloneNode(true) as HTMLElement;

    // Restore mobile carousel state — show all blocks
    clone.querySelectorAll(".vizardry-block").forEach(b => b.classList.add("vizardry-block-active"));
    clone.querySelectorAll(".vzd-pl-row").forEach(r => r.classList.add("vzd-pl-row--active"));

    // Restore Story / Journey column carousel to the full grid (shared with the
    // PNG export's revealForCapture; the clone is discarded, so no snapshot).
    if (clone.classList.contains("vzd-story-grid")) revealColumnCarousel(clone, "story");
    if (clone.classList.contains("vzd-journey-grid")) revealColumnCarousel(clone, "journey");

    rebindPresentationInteractions(clone, sourceContainer);
    wrap.appendChild(clone);
  };

  loadContent();

  reloadBtn.addEventListener("click", () => {
    reloadBtn.addClass("vzd-presentation-reload--spinning");
    loadContent();
    setTimeout(() => reloadBtn.removeClass("vzd-presentation-reload--spinning"), 400);
  });

  const dismiss = (): void => {
    overlay.remove();
    doc.removeEventListener("keydown", onKeyDown);
    // Hand focus back to where the presentation was opened from.
    if (previouslyFocused?.isConnected) previouslyFocused.focus({ preventScroll: true });
  };

  closeBtn.addEventListener("click", dismiss);
  // Move focus into the dialog so keyboard and screen-reader users are not
  // left on the page hidden behind it.
  closeBtn.focus({ preventScroll: true });

  const onKeyDown = (e: KeyboardEvent): void => { if (e.key === "Escape") dismiss(); };
  doc.addEventListener("keydown", onKeyDown);

  // Guard: if the overlay is removed from the DOM without dismiss() being
  // called (e.g. a plugin reload), clean up the document-level listener so it
  // doesn't accumulate across reloads.
  onDisconnected(overlay, () => {
    doc.removeEventListener("keydown", onKeyDown);
  });

  let touchStartY = 0;
  overlay.addEventListener("touchstart", (e) => { touchStartY = e.touches[0].clientY; }, { passive: true });
  overlay.addEventListener("touchend", (e) => {
    if (e.changedTouches[0].clientY - touchStartY > 80) dismiss();
  }, { passive: true });
}

// Each interactive element is assigned a stable data-vzd-id at render time via
// markInteractive(). The clone delegates clicks back to the source by ID,
// firing the original handler without any structural DOM inference.
function rebindPresentationInteractions(cloneRoot: HTMLElement, sourceContainer: HTMLElement): void {
  cloneRoot.querySelectorAll<HTMLElement>("[data-vzd-id]").forEach(cloneEl => {
    const id = cloneEl.dataset.vzdId!;
    cloneEl.addEventListener("click", (e) => {
      e.stopPropagation();
      sourceContainer.querySelector<HTMLElement>(`[data-vzd-id="${CSS.escape(id)}"]`)?.click();
    });
  });
}
