interface FullWidthState {
  resizeObserver?: ResizeObserver;
  mutationObserver?: MutationObserver;
  windowHandler?: () => void;
  observedContainer?: HTMLElement | null;
}

const stateMap = new WeakMap<HTMLElement, FullWidthState>();

function getState(el: HTMLElement): FullWidthState {
  let state = stateMap.get(el);
  if (!state) { state = {}; stateMap.set(el, state); }
  return state;
}

const WORKSPACE_CONTAINER_SELECTORS = [
  ".workspace-leaf-content",
  ".workspace-split.mod-root",
  ".workspace-tabs",
  ".workspace-leaf",
] as const;

function findWorkspaceContainer(canvasEl: HTMLElement): HTMLElement | null {
  for (const selector of WORKSPACE_CONTAINER_SELECTORS) {
    const match = canvasEl.closest<HTMLElement>(selector);
    if (match) return match;
  }
  return null;
}

function cleanupFullWidthWatchers(canvasEl: HTMLElement): void {
  const state = stateMap.get(canvasEl);
  if (!state) return;

  state.resizeObserver?.disconnect();
  state.resizeObserver = undefined;

  state.mutationObserver?.disconnect();
  state.mutationObserver = undefined;

  if (state.windowHandler) {
    window.removeEventListener("resize", state.windowHandler);
    state.windowHandler = undefined;
  }

  state.observedContainer = undefined;
}

function ensureFullWidthWatchers(canvasEl: HTMLElement, container: HTMLElement | null): void {
  const state = getState(canvasEl);
  if (state.observedContainer === container && state.mutationObserver) return;

  cleanupFullWidthWatchers(canvasEl);
  state.observedContainer = container;

  if (container) {
    const ro = new ResizeObserver(() => {
      if (!canvasEl.isConnected) { cleanupFullWidthWatchers(canvasEl); return; }
      applyFullWidth(canvasEl);
    });
    ro.observe(container);
    state.resizeObserver = ro;
  } else {
    const onResize = (): void => {
      if (!canvasEl.isConnected) { cleanupFullWidthWatchers(canvasEl); return; }
      applyFullWidth(canvasEl);
    };
    window.addEventListener("resize", onResize);
    state.windowHandler = onResize;
  }

  const parent = canvasEl.parentElement ?? document.body;
  const mo = new MutationObserver(() => {
    if (!canvasEl.isConnected || !parent.contains(canvasEl)) {
      cleanupFullWidthWatchers(canvasEl);
    }
  });
  mo.observe(parent, { childList: true });
  state.mutationObserver = mo;
}

export function applyFullWidth(canvasEl: HTMLElement): void {
  const isEditView = !!canvasEl.closest(".cm-editor");
  const container = findWorkspaceContainer(canvasEl);

  if (isEditView) {
    canvasEl.style.position = "";
    canvasEl.style.left = "";
    canvasEl.style.transform = "";
    canvasEl.style.width = "100%";
    canvasEl.style.maxWidth = "100%";
    canvasEl.style.marginLeft = "";
    canvasEl.style.marginRight = "";
  } else {
    const readableLineWidth = document.body.classList.contains("is-readable-line-width");

    if (!readableLineWidth) {
      canvasEl.style.position = "";
      canvasEl.style.left = "";
      canvasEl.style.transform = "";
      canvasEl.style.width = "100%";
      canvasEl.style.maxWidth = "100%";
      canvasEl.style.marginLeft = "";
      canvasEl.style.marginRight = "";
    } else {
      const viewContent = canvasEl.closest<HTMLElement>(".view-content");
      const measureEl = viewContent ?? container ?? document.documentElement;
      const computed = getComputedStyle(measureEl);
      const paddingLeft = parseFloat(computed.paddingLeft) || 0;
      const paddingRight = parseFloat(computed.paddingRight) || 0;
      const availableWidth = measureEl.clientWidth - paddingLeft - paddingRight;

      const HORIZONTAL_MARGIN = 32;
      const finalWidth = Math.max(0, availableWidth - HORIZONTAL_MARGIN);
      const px = `${finalWidth}px`;

      canvasEl.style.position = "relative";
      canvasEl.style.left = "50%";
      canvasEl.style.transform = "translateX(-50%)";
      canvasEl.style.width = px;
      canvasEl.style.maxWidth = px;
      canvasEl.style.marginLeft = "auto";
      canvasEl.style.marginRight = "auto";
    }
  }

  ensureFullWidthWatchers(canvasEl, container);
}
