import "./obsidian-polyfills";
import { app, ctx } from "./obsidian-polyfills";
import { renderDocument } from "./markdown";
import { initTheme, toggleTheme } from "./theme";

// ── Sketch mode SVG defs (hand-drawn wobble filter) ─────────────────────────
function injectSketchDefs(): void {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("id", "vzd-sketch-defs");
  svg.setAttribute("width", "0");
  svg.setAttribute("height", "0");
  svg.style.position = "absolute";
  const filter = document.createElementNS(NS, "filter");
  filter.setAttribute("id", "vzd-sketch-rough");
  const turb = document.createElementNS(NS, "feTurbulence");
  turb.setAttribute("type", "fractalNoise");
  turb.setAttribute("baseFrequency", "0.02");
  turb.setAttribute("numOctaves", "2");
  turb.setAttribute("seed", "7");
  turb.setAttribute("result", "noise");
  const disp = document.createElementNS(NS, "feDisplacementMap");
  disp.setAttribute("in", "SourceGraphic");
  disp.setAttribute("in2", "noise");
  disp.setAttribute("scale", "1.1");
  disp.setAttribute("xChannelSelector", "R");
  disp.setAttribute("yChannelSelector", "G");
  filter.appendChild(turb);
  filter.appendChild(disp);
  svg.appendChild(filter);
  document.body.appendChild(svg);
}

// ── UI state ────────────────────────────────────────────────────────────────
const emptyState = document.getElementById("empty-state")!;
const rendered = document.getElementById("rendered")!;
const textarea = document.getElementById("md-input") as HTMLTextAreaElement;
const fileInput = document.getElementById("file-input") as HTMLInputElement;
const btnRender = document.getElementById("btn-render")!;
const btnClear = document.getElementById("btn-clear")!;
const btnOpenFile = document.getElementById("btn-open-file")!;
const btnOpenFile2 = document.getElementById("btn-open-file-2")!;
const btnTheme = document.getElementById("btn-theme")!;

function showEmpty(): void {
  emptyState.style.display = "";
  rendered.style.display = "none";
  btnClear.style.display = "none";
}

function showRendered(): void {
  emptyState.style.display = "none";
  rendered.style.display = "";
  btnClear.style.display = "";
}

function render(markdown: string): void {
  rendered.innerHTML = "";
  renderDocument(markdown, rendered, app, ctx);
  showRendered();
}

function openFile(): void {
  fileInput.click();
}

function readFile(file: File): void {
  const reader = new FileReader();
  reader.onload = () => render(reader.result as string);
  reader.readAsText(file);
}

// ── Event handlers ──────────────────────────────────────────────────────────
btnRender.addEventListener("click", () => {
  const text = textarea.value.trim();
  if (text) render(text);
});

textarea.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    e.preventDefault();
    const text = textarea.value.trim();
    if (text) render(text);
  }
});

btnClear.addEventListener("click", () => {
  textarea.value = "";
  rendered.innerHTML = "";
  showEmpty();
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
let dragCounter = 0;

document.addEventListener("dragenter", (e) => {
  e.preventDefault();
  dragCounter++;
  document.body.classList.add("vzd-ext-drop-active");
});

document.addEventListener("dragleave", () => {
  dragCounter--;
  if (dragCounter <= 0) {
    dragCounter = 0;
    document.body.classList.remove("vzd-ext-drop-active");
  }
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
injectSketchDefs();
