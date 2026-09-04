/**
 * Runtime glue for the print pipeline. This is the one module in ./print that
 * touches `obsidian`, the DOM and Paged.js, so it is exercised only inside the
 * Obsidian host (the pure builders it calls are unit-tested separately).
 *
 * Flow:
 *   1. Render the note once to an offscreen element via Obsidian's own
 *      MarkdownRenderer — this runs the Vizardry code-block processor and core
 *      Mermaid rendering, so canvases and diagrams come out as real DOM/SVG.
 *      The result is a reusable "master" (see `prepareDocument`).
 *   2. Paginate a *clone* of the master with Paged.js, which materialises the
 *      `@page` margin boxes (page numbers, running header) that Chromium's
 *      print path ignores. Re-paginating on an option change reuses the master,
 *      so only the (cheap) layout pass re-runs — not the markdown render.
 *   3. Show those pages in a preview container, or move them into a hidden
 *      iframe and print that in isolation — printing the iframe prints only its
 *      own document, so the host Obsidian window doesn't need `@media print`
 *      isolation (which proved unreliable in Electron).
 *
 * Note on styling: the plugin's own styles.css is already loaded globally in the
 * Obsidian document, and both the preview pages and the print portal live in
 * that document — so `.vzd-print`-scoped canvas rules already apply. We do NOT
 * re-load styles.css or push it through Paged.js; only the small generated print
 * stylesheet goes to the polisher.
 */

import type { App, TFile } from "obsidian";
import { Component, MarkdownRenderer, Notice, normalizePath } from "obsidian";
import { Previewer } from "pagedjs";
import type { PrintOptions } from "./options";
import { getPrintTemplate } from "./templates";
import { buildPrintCss } from "./css";
import { stripFrontmatter } from "./frontmatter";
import { t } from "../i18n";

export interface PrintContext {
  app: App;
  /**
   * Plugin install dir. Used to inline the plugin's own styles.css into the
   * print iframe, which is a separate document where the globally-loaded
   * styles.css does not apply.
   */
  pluginDir?: string;
}

/**
 * Class on the offscreen element the note is rendered into for printing. The
 * key-enrichment post-processors skip anything inside it (see main.ts), so the
 * print render never grows Linear/Upvoty badges, popovers, summaries, or their
 * network calls — keys print as plain text.
 */
export const PRINT_SCRATCH_CLASS = "vzd-print-scratch";

/** Offscreen container the pages are paginated into before moving to the print iframe. */
export const PRINT_PORTAL_CLASS = "vzd-print-portal";

/** The hidden iframe the paginated pages are printed from in isolation. */
export const PRINT_FRAME_CLASS = "vzd-print-frame";

/** Guards against two overlapping print runs (see printPrepared). */
let printInProgress = false;

/**
 * A note rendered once, ready to paginate repeatedly. `master` is the reusable
 * source DOM — never handed to Paged.js directly (it mutates content), always
 * cloned. Call `destroy()` once done to unload the render component.
 */
export interface PreparedDoc {
  master: HTMLElement;
  title: string;
  destroy(): void;
}

export interface PaginateResult {
  pageCount: number;
  /**
   * Removes exactly the `<style>` elements Paged.js appended to `<head>` for
   * this run — both the `[data-pagedjs-inserted-styles]` sheets and the
   * un-attributed dynamic `styleEl` holding the computed `@page` rules. Without
   * this, every pagination leaks stylesheets into the document head. Attribution
   * is exact only when paginations don't overlap — callers must serialise them
   * (the dialog does).
   */
  removeStyles(): void;
}

/**
 * Resolve on the next animation frame, but never hang: `requestAnimationFrame`
 * is throttled (or paused entirely) while the window is backgrounded, so we
 * race it against a timeout to guarantee the export keeps moving.
 */
const nextFrame = (): Promise<void> =>
  new Promise((resolve) => {
    let done = false;
    const finish = (): void => {
      if (done) return;
      done = true;
      resolve();
    };
    requestAnimationFrame(finish);
    setTimeout(finish, 100);
  });

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Resolve once an image has loaded (or immediately if already complete/broken). */
function whenImageSettled(img: HTMLImageElement): Promise<void> {
  if (img.complete) return Promise.resolve();
  return new Promise((resolve) => {
    const done = (): void => resolve();
    img.addEventListener("load", done, { once: true });
    img.addEventListener("error", done, { once: true });
  });
}

/**
 * Resolve once `el`'s subtree has stopped mutating for `quietMs`, or `maxMs`
 * elapses — whichever comes first. This adapts to however long asynchronous
 * rendering actually takes (chiefly Mermaid, which swaps in its SVG after the
 * markdown pass) instead of guessing a fixed delay: quick notes settle almost
 * immediately, slow ones get up to the cap.
 */
function waitForQuiescence(el: HTMLElement, quietMs: number, maxMs: number): Promise<void> {
  return new Promise((resolve) => {
    let quietTimer = 0;
    let capTimer = 0;
    const finish = (): void => {
      clearTimeout(quietTimer);
      clearTimeout(capTimer);
      observer.disconnect();
      resolve();
    };
    const observer = new MutationObserver(() => {
      clearTimeout(quietTimer);
      quietTimer = window.setTimeout(finish, quietMs);
    });
    // Hard ceiling so a canvas that never stops animating can't hang the export.
    capTimer = window.setTimeout(finish, maxMs);
    // If nothing ever mutates, this fires and we resolve after one quiet window.
    quietTimer = window.setTimeout(finish, quietMs);
    observer.observe(el, { childList: true, subtree: true, attributes: true, characterData: true });
  });
}

/**
 * Wait for async rendering to settle: two animation frames (so synchronously
 * inserted Vizardry canvases lay out — they mark themselves `data-vizardry-
 * rendered` on completion), then any images, then DOM quiescence to catch
 * Mermaid's asynchronous SVG swap.
 */
async function settle(el: HTMLElement): Promise<void> {
  await nextFrame();
  await nextFrame();
  await Promise.all(Array.from(el.querySelectorAll("img")).map(whenImageSettled));
  await waitForQuiescence(el, 120, 2500);
}

/**
 * Build the print-scoped content wrapper (`.vzd-print` → `.vzd-print-body`)
 * around the freshly rendered note nodes, with an optional leading title block.
 * Done on live DOM (not the pure ./html builder) so inline SVG is preserved.
 */
function wrapContent(rendered: HTMLElement, title: string): HTMLElement {
  const root = document.createElement("div");
  root.className = "vzd-print";
  const body = root.createDiv({ cls: "vzd-print-body" });
  // Always emit the title block; the `showTitle` option toggles its visibility
  // via generated CSS (see buildPrintCss), so it can change without re-rendering.
  if (title.trim()) {
    const header = body.createEl("header", { cls: "vzd-print-title" });
    header.createEl("h1", { text: title.trim() });
  }
  // Move the rendered children across rather than innerHTML so canvases and
  // event-bound SVGs survive intact.
  while (rendered.firstChild) body.appendChild(rendered.firstChild);
  return root;
}

/**
 * Render a note once into a reusable master. Expensive (runs MarkdownRenderer
 * over the whole note plus a settle delay), so callers should prepare once and
 * paginate many times.
 */
export async function prepareDocument(ctx: PrintContext, file: TFile): Promise<PreparedDoc> {
  const markdown = stripFrontmatter(await ctx.app.vault.cachedRead(file));
  const title = file.basename;

  // Offscreen scratch element: must be in the document for renderers that
  // measure layout, but kept out of view and out of the print flow. Its class
  // also tells the enrichment post-processors to leave this render alone.
  const scratch = document.body.createDiv({ cls: PRINT_SCRATCH_CLASS });
  const component = new Component();
  component.load();
  try {
    await MarkdownRenderer.render(ctx.app, markdown, scratch, file.path, component);
    await settle(scratch);
    const master = wrapContent(scratch, title);
    scratch.remove();
    return { master, title, destroy: () => component.unload() };
  } catch (err) {
    // Don't leak the offscreen scratch or the render component if rendering
    // fails partway — the caller only ever sees the thrown error.
    scratch.remove();
    component.unload();
    throw err;
  }
}

/**
 * Paginate a clone of `master` into `renderTo` with the given print stylesheet,
 * capturing the head `<style>` nodes Paged.js injects so the caller can clean
 * them up. `master` itself is never mutated (Paged.js annotates the content it
 * is given), so it stays reusable.
 */
async function paginate(
  master: HTMLElement,
  printCss: string,
  renderTo: HTMLElement,
): Promise<PaginateResult> {
  const before = new Set(Array.from(document.head.querySelectorAll("style")));
  const previewer = new Previewer();
  const content = master.cloneNode(true) as HTMLElement;
  // Object form → the value is treated as raw CSS text (see polisher.add).
  const flow = await previewer.preview(content, [{ "vzd-print": printCss }], renderTo);
  const added = Array.from(document.head.querySelectorAll("style")).filter((s) => !before.has(s));
  return {
    pageCount: flow?.total ?? renderTo.querySelectorAll(".pagedjs_page").length,
    removeStyles: () => added.forEach((s) => s.remove()),
  };
}

/** The print stylesheet a prepared doc would paginate with for these options. */
export function buildDocCss(doc: PreparedDoc, options: PrintOptions): string {
  return buildPrintCss(getPrintTemplate(options.templateId), options, doc.title);
}

/** Paginate a clone of the prepared doc's master with an already-built stylesheet. */
export function paginateCss(
  doc: PreparedDoc,
  printCss: string,
  renderTo: HTMLElement,
): Promise<PaginateResult> {
  return paginate(doc.master, printCss, renderTo);
}

/** Paginate a prepared doc for the given options into `renderTo`. */
export function paginatePrepared(
  doc: PreparedDoc,
  options: PrintOptions,
  renderTo: HTMLElement,
): Promise<PaginateResult> {
  return paginateCss(doc, buildDocCss(doc, options), renderTo);
}

/** Serialize a `<style>` element's rules, including any added via CSSOM insertRule. */
function serializeStyle(style: HTMLStyleElement): string {
  // Paged.js populates part of its styles via `sheet.insertRule`, which never
  // shows up in `textContent`. Read the live CSSOM first so the @page sizing it
  // computes actually reaches the iframe; fall back to textContent otherwise.
  try {
    const sheet = style.sheet;
    if (sheet && sheet.cssRules.length) {
      return Array.from(sheet.cssRules).map((r) => r.cssText).join("\n");
    }
  } catch {
    // A detached/cross-origin sheet throws on access — use textContent.
  }
  return style.textContent ?? "";
}

/**
 * Print `bodyHtml` (paginated pages) from a hidden, isolated iframe.
 *
 * Printing an iframe prints only that frame's document, so there is no need to
 * hide the host Obsidian UI with `@media print` (which proved unreliable in
 * Electron) — and Paged.js's print CSS gets the clean `<body> → .pagedjs_pages
 * → .pagedjs_page` height chain it assumes, instead of one broken by a wrapper.
 */
function printViaIframe(pluginCss: string, pagedCss: string, bodyHtml: string): Promise<void> {
  return new Promise((resolve) => {
    const iframe = document.createElement("iframe");
    iframe.className = PRINT_FRAME_CLASS;
    document.body.appendChild(iframe);

    const win = iframe.contentWindow;
    const idoc = iframe.contentDocument;
    if (!win || !idoc) {
      iframe.remove();
      resolve();
      return;
    }

    let done = false;
    const finish = (): void => {
      if (done) return;
      done = true;
      iframe.remove();
      resolve();
    };

    // document.write (synchronous, same-origin) rather than srcdoc + the load
    // event, and setTimeout rather than requestAnimationFrame — an off-screen /
    // invisible iframe has its rAF throttled by Chromium, which is why the
    // earlier version never fired print(). The iframe keeps the parent origin,
    // so app:// / https images still resolve.
    idoc.open();
    idoc.write(
      `<!doctype html><html><head><meta charset="utf-8">` +
        `<style>${pluginCss}</style><style>${pagedCss}</style>` +
        `</head><body>${bodyHtml}</body></html>`,
    );
    idoc.close();

    win.addEventListener("afterprint", finish, { once: true });
    // Fallback: afterprint isn't guaranteed on every platform.
    setTimeout(finish, 60_000);
    // Give the written document a beat to lay out, then print.
    setTimeout(() => {
      try {
        win.focus();
        win.print();
      } catch (err) {
        console.error("Vizardry: iframe print failed", err);
        finish();
      }
    }, 250);
  });
}

/**
 * Paginate a prepared doc offscreen, then print it from an isolated iframe.
 * `pluginCss` is inlined into that iframe so canvases keep their styling.
 * Does NOT own `doc`; the caller destroys it.
 */
export async function printPrepared(
  doc: PreparedDoc,
  options: PrintOptions,
  pluginCss: string,
): Promise<void> {
  if (printInProgress) {
    new Notice(t("print.notice.inProgress"));
    return;
  }
  printInProgress = true;
  try {
    // Paginate in the main document (Paged.js needs real layout), capturing the
    // pages' HTML and the CSS Paged.js computed (its base styles + our processed
    // print stylesheet, page-number margin boxes and all).
    const staging = document.body.createDiv({ cls: PRINT_PORTAL_CLASS });
    let pagesHtml = "";
    let pagedCss = "";
    try {
      const before = new Set(Array.from(document.head.querySelectorAll("style")));
      await paginatePrepared(doc, options, staging);
      const added = Array.from(document.head.querySelectorAll("style")).filter((s) => !before.has(s));
      pagedCss = added.map(serializeStyle).join("\n");
      pagesHtml = staging.innerHTML;
      added.forEach((s) => s.remove());
    } finally {
      staging.remove();
    }

    if (!pagesHtml.trim()) return;
    await printViaIframe(pluginCss, pagedCss, pagesHtml);
  } finally {
    printInProgress = false;
  }
}

/**
 * One-shot: render the active note and open the system print dialog for it.
 * Standalone entry point (e.g. a direct-print command) — the dialog reuses its
 * already-prepared doc via `printPrepared` instead.
 */
export async function printNote(
  ctx: PrintContext,
  file: TFile,
  options: PrintOptions,
): Promise<void> {
  let doc: PreparedDoc | null = null;
  try {
    doc = await prepareDocument(ctx, file);
    const pluginCss = await loadPluginCss(ctx);
    await printPrepared(doc, options, pluginCss);
    doc.destroy();
  } catch (err) {
    console.error("Vizardry: print export failed", err);
    doc?.destroy();
    new Notice(t("print.notice.failed"));
  }
}

/** Read the plugin's own styles.css to inline into the print iframe. */
async function loadPluginCss(ctx: PrintContext): Promise<string> {
  if (!ctx.pluginDir) return "";
  try {
    return await ctx.app.vault.adapter.read(normalizePath(`${ctx.pluginDir}/styles.css`));
  } catch {
    // Non-fatal: canvases fall back to browser defaults for any rule only in
    // styles.css; the note still prints.
    return "";
  }
}
