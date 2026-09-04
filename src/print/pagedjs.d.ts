/**
 * Minimal ambient types for Paged.js — the package ships no declarations and
 * @types/pagedjs does not exist. We type only the surface Vizardry uses
 * (`Previewer.preview`), leaving the rest implicit.
 */
declare module "pagedjs" {
  /** The flow object returned by `Previewer.preview`. */
  export interface PagedFlow {
    /** Total number of pages produced. */
    total?: number;
    pages?: unknown[];
    performance?: number;
  }

  export class Previewer {
    constructor();
    /**
     * Paginate `content` into `renderTo`, applying `stylesheets`. Each
     * stylesheet may be a URL string or an object whose values are raw CSS text.
     */
    preview(
      content: HTMLElement | DocumentFragment | string | undefined,
      stylesheets: Array<string | Record<string, string>> | undefined,
      renderTo: HTMLElement,
    ): Promise<PagedFlow>;
  }
}
