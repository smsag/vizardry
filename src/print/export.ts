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
 *   3. Show those pages in a preview container, or drop them into an offscreen
 *      print portal and call `window.print()`.
 *
 * Note on styling: the plugin's own styles.css is already loaded globally in the
 * Obsidian document, and both the preview pages and the print portal live in
 * that document — so `.vzd-print`-scoped canvas rules already apply. We do NOT
 * re-load styles.css or push it through Paged.js; only the small generated print
 * stylesheet goes to the polisher. (The standalone-file exporter in ./html is
 * the exception — it inlines styles.css because it is a separate document.)
 */

import type { App, TFile } from "obsidian";
import { Component, MarkdownRenderer, Notice } from "obsidian";
import { Previewer } from "pagedjs";
import type { PrintOptions } from "./options";
import { getPrintTemplate } from "./templates";
import { buildPrintCss } from "./css";
import { t } from "../i18n";

export interface PrintContext {
  app: App;
}

/**
 * Class on the offscreen element the note is rendered into for printing. The
 * key-enrichment post-processors skip anything inside it (see main.ts), so the
 * print render never grows Linear/Upvoty badges, popovers, summaries, or their
 * network calls — keys print as plain text.
 */
export const PRINT_SCRATCH_CLASS = "vzd-print-scratch";

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
function wrapContent(rendered: HTMLElement, title: string, showTitle: boolean): HTMLElement {
  const root = document.createElement("div");
  root.className = "vzd-print";
  const body = root.createDiv({ cls: "vzd-print-body" });
  if (showTitle && title.trim()) {
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
  const markdown = await ctx.app.vault.cachedRead(file);
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
    const master = wrapContent(scratch, title, /* showTitle */ true);
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

/** Paginate a prepared doc for the given options into `renderTo`. */
export function paginatePrepared(
  doc: PreparedDoc,
  options: PrintOptions,
  renderTo: HTMLElement,
): Promise<PaginateResult> {
  const template = getPrintTemplate(options.templateId);
  const printCss = buildPrintCss(template, options, doc.title);
  return paginate(doc.master, printCss, renderTo);
}

/**
 * Paginate a prepared doc into an offscreen portal and open the system print
 * dialog. The portal is only revealed — and the surrounding Obsidian UI hidden —
 * by the `@media print` rules in styles.css, so the sheet contains just the
 * note. Does NOT own `doc`; the caller destroys it.
 */
export async function printPrepared(doc: PreparedDoc, options: PrintOptions): Promise<void> {
  // One print at a time: a second run would append another portal and toggle
  // the shared `vzd-printing` class / head-style bookkeeping out from under the
  // first. Rare (the dialog closes before printing), but cheap to rule out.
  if (printInProgress) {
    new Notice(t("print.notice.inProgress"));
    return;
  }
  printInProgress = true;

  const portal = document.body.createDiv({ cls: "vzd-print-portal" });
  let removeStyles: () => void;
  try {
    ({ removeStyles } = await paginatePrepared(doc, options, portal));
  } catch (err) {
    // Pagination failed before we armed any cleanup — remove the empty portal
    // so it doesn't linger, and release the lock.
    portal.remove();
    printInProgress = false;
    throw err;
  }

  document.body.addClass("vzd-printing");

  let torndown = false;
  const cleanup = (): void => {
    // afterprint plus the fallback timeout can both fire — run once.
    if (torndown) return;
    torndown = true;
    document.body.removeClass("vzd-printing");
    portal.remove();
    removeStyles();
    window.removeEventListener("afterprint", cleanup);
    printInProgress = false;
  };
  window.addEventListener("afterprint", cleanup);
  // Fallback: some platforms never fire afterprint — tear down anyway.
  setTimeout(cleanup, 60_000);

  window.print();
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
    await printPrepared(doc, options);
    // Ownership: printPrepared cloned the master, so the source can be released
    // now; the printed clone lives on in the portal until afterprint.
    doc.destroy();
  } catch (err) {
    console.error("Vizardry: print export failed", err);
    document.body.removeClass("vzd-printing");
    doc?.destroy();
    new Notice(t("print.notice.failed"));
  }
}
