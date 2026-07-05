import { FULL_WIDTH_MARGIN_PX } from "../shared/constants";
import { onDisconnected, ownerWindow } from "../shared/lifecycle";

interface FullWidthState {
  resizeObserver?: ResizeObserver;
  windowHandler?: () => void;
  // Cancels the onDisconnected MutationObserver so it doesn't accumulate
  // when the workspace container changes and a new one is registered.
  disposeDisconnectWatch?: () => void;
  // rAF id for debouncing resize events
  resizeRafId?: number;
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

  if (state.windowHandler) {
    ownerWindow(canvasEl).removeEventListener("resize", state.windowHandler);
    state.windowHandler = undefined;
  }

  if (state.resizeRafId) {
    ownerWindow(canvasEl).cancelAnimationFrame(state.resizeRafId);
    state.resizeRafId = undefined;
  }

  state.disposeDisconnectWatch?.();
  state.disposeDisconnectWatch = undefined;

  state.observedContainer = undefined;
}

function ensureFullWidthWatchers(canvasEl: HTMLElement, container: HTMLElement | null): void {
  const state = getState(canvasEl);
  if (state.observedContainer === container && (state.resizeObserver || state.windowHandler)) return;

  cleanupFullWidthWatchers(canvasEl);
  state.observedContainer = container;
  const win = ownerWindow(canvasEl);

  if (container) {
    const ro = new ResizeObserver(() => {
      if (!canvasEl.isConnected) { cleanupFullWidthWatchers(canvasEl); return; }
      // Debounce: collapse multiple resize events in the same frame into one
      // applyFullWidth call. Without this, panel drags can fire 30-60 events/s.
      win.cancelAnimationFrame(state.resizeRafId ?? 0);
      state.resizeRafId = win.requestAnimationFrame(() => applyFullWidth(canvasEl));
    });
    ro.observe(container);
    state.resizeObserver = ro;
  } else {
    const onResize = (): void => {
      if (!canvasEl.isConnected) { cleanupFullWidthWatchers(canvasEl); return; }
      win.cancelAnimationFrame(state.resizeRafId ?? 0);
      state.resizeRafId = win.requestAnimationFrame(() => applyFullWidth(canvasEl));
    };
    win.addEventListener("resize", onResize);
    state.windowHandler = onResize;
  }

  // Track the disposer so cleanupFullWidthWatchers can cancel the observer
  // if the workspace container changes before the element is removed from DOM.
  state.disposeDisconnectWatch = onDisconnected(canvasEl, () => cleanupFullWidthWatchers(canvasEl));
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
    const readableLineWidth = canvasEl.ownerDocument.body.classList.contains("is-readable-line-width");

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
      const measureEl = viewContent ?? container ?? canvasEl.ownerDocument.documentElement;
      const computed = ownerWindow(canvasEl).getComputedStyle(measureEl);
      const paddingLeft = parseFloat(computed.paddingLeft) || 0;
      const paddingRight = parseFloat(computed.paddingRight) || 0;
      const availableWidth = measureEl.clientWidth - paddingLeft - paddingRight;

      const finalWidth = Math.max(0, availableWidth - FULL_WIDTH_MARGIN_PX);
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
