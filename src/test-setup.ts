/**
 * Test setup — polyfills Obsidian's HTMLElement extensions so renderer tests
 * can run in a happy-dom environment without the full Obsidian runtime.
 *
 * Only the subset of the Obsidian API actually used by Vizardry renderers is
 * polyfilled here. Add methods as needed when new renderers are tested.
 */

type CreateElOptions = {
  cls?: string | string[];
  text?: string;
  attr?: Record<string, string>;
};

// ── HTMLElement extensions ────────────────────────────────────────────────────

Object.assign(HTMLElement.prototype, {
  createEl<K extends keyof HTMLElementTagNameMap>(
    this: HTMLElement,
    tag: K,
    options?: CreateElOptions,
  ): HTMLElementTagNameMap[K] {
    const el = document.createElement(tag);
    if (options?.cls) {
      const classes = Array.isArray(options.cls) ? options.cls : options.cls.split(" ");
      el.classList.add(...classes.filter(Boolean));
    }
    if (options?.text) el.textContent = options.text;
    if (options?.attr) {
      for (const [k, v] of Object.entries(options.attr)) el.setAttribute(k, v);
    }
    this.appendChild(el);
    return el as HTMLElementTagNameMap[K];
  },

  addClass(this: HTMLElement, ...cls: string[]): HTMLElement {
    this.classList.add(...cls);
    return this;
  },

  removeClass(this: HTMLElement, ...cls: string[]): HTMLElement {
    this.classList.remove(...cls);
    return this;
  },

  hasClass(this: HTMLElement, cls: string): boolean {
    return this.classList.contains(cls);
  },

  empty(this: HTMLElement): HTMLElement {
    while (this.firstChild) this.removeChild(this.firstChild);
    return this;
  },

  appendText(this: HTMLElement, text: string): HTMLElement {
    this.appendChild(document.createTextNode(text));
    return this;
  },
});

// ── window stubs ──────────────────────────────────────────────────────────────

// happy-dom may not implement matchMedia; provide a no-op stub.
if (!window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (_query: string) => ({
      matches: false,
      media: _query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

// requestAnimationFrame stub for initCanvas → applyFullWidth scheduling.
if (!window.requestAnimationFrame) {
  Object.defineProperty(window, "requestAnimationFrame", {
    writable: true,
    value: (cb: FrameRequestCallback) => { cb(0); return 0; },
  });
}
