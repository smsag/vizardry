import { app, ctx } from "./obsidian-polyfills";
import { renderDocument } from "./markdown";
import { initTheme, toggleTheme } from "./theme";
import { ensureSketchDefs } from "../src/shared/sketch-defs";

/** Largest file the viewer will read. Markdown notes are small; a multi-MB
 *  drop is almost certainly the wrong file, and parsing it would freeze the
 *  page. */
const MAX_FILE_BYTES = 8 * 1024 * 1024;

// ── UI state ────────────────────────────────────────────────────────────────
function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`viewer.html is missing #${id}`);
  return el as T;
}

const emptyState = byId<HTMLElement>("empty-state");
const rendered = byId<HTMLElement>("rendered");
const status = byId<HTMLElement>("status");
const textarea = byId<HTMLTextAreaElement>("md-input");
const fileInput = byId<HTMLInputElement>("file-input");
const btnRender = byId<HTMLButtonElement>("btn-render");
const btnClear = byId<HTMLButtonElement>("btn-clear");
const btnOpenFile = byId<HTMLButtonElement>("btn-open-file");
const btnOpenFile2 = byId<HTMLButtonElement>("btn-open-file-2");
const btnTheme = byId<HTMLButtonElement>("btn-theme");

function showEmpty(): void {
  emptyState.hidden = false;
  rendered.hidden = true;
  btnClear.hidden = true;
}

function showRendered(): void {
  emptyState.hidden = true;
  rendered.hidden = false;
  btnClear.hidden = false;
}

function showStatus(message: string): void {
  status.textContent = message;
  status.hidden = message === "";
}

function render(markdown: string): void {
  rendered.empty();
  showStatus("");
  try {
    renderDocument(markdown, rendered, app, ctx);
  } catch (err) {
    // One bad document must not leave the page half-rendered with no
    // explanation. Per-canvas errors are handled inside renderDocument;
    // this catches a failure in the Markdown parser itself.
    rendered.empty();
    rendered.createEl("pre", {
      cls: "vzd-ext-error",
      text: `Could not render this document: ${err instanceof Error ? err.message : String(err)}`,
    });
    console.error("[vizardry] render failed", err);
  }
  showRendered();
}

function renderTextarea(): void {
  const text = textarea.value.trim();
  if (text) render(text);
}

function openFile(): void {
  fileInput.click();
}

function readFile(file: File): void {
  if (file.size > MAX_FILE_BYTES) {
    showStatus(`"${file.name}" is ${(file.size / 1024 / 1024).toFixed(1)} MB — the viewer opens Markdown files up to ${MAX_FILE_BYTES / 1024 / 1024} MB.`);
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const text = typeof reader.result === "string" ? reader.result : "";
    textarea.value = text;
    render(text);
  };
  reader.onerror = () => {
    showStatus(`Could not read "${file.name}": ${reader.error?.message ?? "unknown error"}`);
  };
  reader.readAsText(file);
}

// ── Event handlers ──────────────────────────────────────────────────────────
btnRender.addEventListener("click", renderTextarea);

textarea.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    e.preventDefault();
    renderTextarea();
  }
});

btnClear.addEventListener("click", () => {
  textarea.value = "";
  rendered.empty();
  showStatus("");
  showEmpty();
  textarea.focus();
});

btnOpenFile.addEventListener("click", openFile);
btnOpenFile2.addEventListener("click", openFile);
btnTheme.addEventListener("click", toggleTheme);

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) readFile(file);
  fileInput.value = "";
});

// ── Drag and drop ───────────────────────────────────────────────────────────
// dragenter/dragleave fire for every child the pointer crosses, so a counter
// is the only reliable way to know when the pointer has really left the page.
let dragCounter = 0;

document.addEventListener("dragenter", (e) => {
  e.preventDefault();
  dragCounter++;
  document.body.classList.add("vzd-ext-drop-active");
});

document.addEventListener("dragleave", () => {
  dragCounter = Math.max(0, dragCounter - 1);
  if (dragCounter === 0) document.body.classList.remove("vzd-ext-drop-active");
});

document.addEventListener("dragover", (e) => e.preventDefault());

document.addEventListener("drop", (e) => {
  e.preventDefault();
  dragCounter = 0;
  document.body.classList.remove("vzd-ext-drop-active");
  const file = e.dataTransfer?.files[0];
  if (file) readFile(file);
});

// ── Init ────────────────────────────────────────────────────────────────────
initTheme();
ensureSketchDefs(document);
showEmpty();
