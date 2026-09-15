/**
 * Polyfills Obsidian's HTMLElement extensions (createEl, addClass, empty, …)
 * for hosts that are not Obsidian: the browser extension, the visual
 * regression harness, and the unit tests (via test-setup.ts).
 *
 * Only the subset of the Obsidian API actually used by Vizardry renderers is
 * polyfilled here. Add methods as needed when a renderer starts using one —
 * a method missing here throws "x is not a function" at render time in every
 * non-Obsidian host, so the unit tests are the first place it shows.
 *
 * Installation is idempotent: the extensions are only assigned when the
 * prototype does not already carry them, so importing this inside the real
 * Obsidian runtime never overrides the host's implementations.
 */

/** Mirrors Obsidian's DomElementInfo (obsidian.d.ts). Every key the real API
 *  accepts is honoured here, so a renderer using `type:` or `href:` renders
 *  the same DOM in the extension and the tests as it does in Obsidian. */
type CreateElOptions = {
  cls?: string | string[];
  text?: string | DocumentFragment;
  attr?: Record<string, string | number | boolean | null>;
  title?: string;
  parent?: Node;
  value?: string;
  type?: string;
  prepend?: boolean;
  placeholder?: string;
  href?: string;
};

// ── HTMLElement extensions ────────────────────────────────────────────────────

const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
const polyfill = {
  createEl<K extends keyof HTMLElementTagNameMap>(
    this: HTMLElement,
    tag: K,
    options?: CreateElOptions | string,
    callback?: (el: HTMLElementTagNameMap[K]) => void,
  ): HTMLElementTagNameMap[K] {
    const o: CreateElOptions | undefined = typeof options === "string" ? { cls: options } : options;
    const el = this.ownerDocument.createElement(tag) as HTMLElementTagNameMap[K];
    if (o?.cls) {
      const classes = Array.isArray(o.cls) ? o.cls : o.cls.split(" ");
      el.classList.add(...classes.filter(Boolean));
    }
    if (o?.text !== undefined) {
      if (typeof o.text === "string") el.textContent = o.text;
      else el.appendChild(o.text);
    }
    if (o?.attr) {
      for (const [k, v] of Object.entries(o.attr)) {
        if (v === null || v === undefined) el.removeAttribute(k);
        else el.setAttribute(k, String(v));
      }
    }
    if (o?.title !== undefined) el.title = o.title;
    if (o?.value !== undefined) (el as unknown as { value: string }).value = o.value;
    if (o?.type !== undefined) el.setAttribute("type", o.type);
    if (o?.placeholder !== undefined) el.setAttribute("placeholder", o.placeholder);
    if (o?.href !== undefined) el.setAttribute("href", o.href);
    const parent = o?.parent ?? this;
    if (o?.prepend) parent.insertBefore(el, parent.firstChild);
    else parent.appendChild(el);
    callback?.(el);
    return el;
  },

  createDiv(this: HTMLElement, options?: CreateElOptions | string, callback?: (el: HTMLDivElement) => void): HTMLDivElement {
    return this.createEl("div", options, callback);
  },

  createSpan(this: HTMLElement, options?: CreateElOptions | string, callback?: (el: HTMLSpanElement) => void): HTMLSpanElement {
    return this.createEl("span", options, callback);
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

  toggleClass(this: HTMLElement, cls: string, value: boolean): HTMLElement {
    this.classList.toggle(cls, value);
    return this;
  },

  setText(this: HTMLElement, text: string): HTMLElement {
    this.textContent = text;
    return this;
  },
};

for (const [name, fn] of Object.entries(polyfill)) {
  if (typeof proto[name] !== "function") proto[name] = fn;
}

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
