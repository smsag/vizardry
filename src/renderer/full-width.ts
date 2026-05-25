type FullWidthCanvasEl = HTMLElement & {
  __vzdFullWidthObserver?: ResizeObserver;
  __vzdFullWidthRemovalObserver?: MutationObserver;
  __vzdFullWidthWindowHandler?: () => void;
  __vzdFullWidthObservedContainer?: HTMLElement | null;
};

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

function cleanupFullWidthWatchers(canvasEl: FullWidthCanvasEl): void {
  canvasEl.__vzdFullWidthObserver?.disconnect();
  canvasEl.__vzdFullWidthObserver = undefined;

  canvasEl.__vzdFullWidthRemovalObserver?.disconnect();
  canvasEl.__vzdFullWidthRemovalObserver = undefined;

  if (canvasEl.__vzdFullWidthWindowHandler) {
    window.removeEventListener("resize", canvasEl.__vzdFullWidthWindowHandler);
    canvasEl.__vzdFullWidthWindowHandler = undefined;
  }

  canvasEl.__vzdFullWidthObservedContainer = undefined;
}

function ensureFullWidthWatchers(canvasEl: FullWidthCanvasEl, container: HTMLElement | null): void {
  const current = canvasEl.__vzdFullWidthObservedContainer;
  if (current === container && canvasEl.__vzdFullWidthRemovalObserver) return;

  cleanupFullWidthWatchers(canvasEl);
  canvasEl.__vzdFullWidthObservedContainer = container;

  if (container) {
    const ro = new ResizeObserver(() => {
      if (!canvasEl.isConnected) { cleanupFullWidthWatchers(canvasEl); return; }
      applyFullWidth(canvasEl);
    });
    ro.observe(container);
    canvasEl.__vzdFullWidthObserver = ro;
  } else {
    const onResize = (): void => {
      if (!canvasEl.isConnected) { cleanupFullWidthWatchers(canvasEl); return; }
      applyFullWidth(canvasEl);
    };
    window.addEventListener("resize", onResize);
    canvasEl.__vzdFullWidthWindowHandler = onResize;
  }

  const parent = canvasEl.parentElement ?? document.body;
  const mo = new MutationObserver(() => {
    if (!canvasEl.isConnected || !parent.contains(canvasEl)) {
      cleanupFullWidthWatchers(canvasEl);
    }
  });
  mo.observe(parent, { childList: true });
  canvasEl.__vzdFullWidthRemovalObserver = mo;
}

export function applyFullWidth(canvasEl: HTMLElement): void {
  const fullWidthEl = canvasEl as FullWidthCanvasEl;
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

  ensureFullWidthWatchers(fullWidthEl, container);
}
