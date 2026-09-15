# Vizardry export API

Vizardry exposes a small, versioned API so another plugin can capture a rendered canvas as a PNG — the same capture the download button produces. It exists for document pipelines: a plugin that typesets a note as a PDF cannot draw a Vizardry canvas, so it asks Vizardry for an image and places that.

The source of truth is `src/renderer/export-api.ts`; this page restates the contract in prose.

## Reaching the API

```ts
import type { VizardryApi } from "vizardry/src/renderer/export-api"; // or copy the types below

const api = (app.plugins.plugins.vizardry as { api?: VizardryApi } | undefined)?.api;
if (api && api.version >= 1) {
  // available
}
```

A missing `api` means Vizardry is absent, disabled, or too old. Callers keep their own fallback capture; Vizardry never throws at load time.

## Compatibility

`version` is `1`. The contract is additive within a version: members are added, never removed or narrowed. A breaking change bumps `version` and is called out in `RELEASE_NOTES.md`.

## Members

### `version: 1`

Check `version >= 1` before using anything else.

### `noEnrichClass: string`

The CSS class (`vizardry-no-enrich`) that switches off Linear and Upvoty key enrichment inside a render host. Put it on your offscreen container *before* rendering the note: enrichment runs during rendering, so nothing can undo it afterwards.

### `getCanvases(root: HTMLElement): HTMLElement[]`

Every Vizardry canvas inside `root`, in document order. `root` itself is included when it is a canvas. Canvases minimised with `collapsed: true` are included and export in full. Clones the sticky pin keeps on screen are excluded, so a canvas is never captured twice.

### `whenSettled(el, options?): Promise<void>`

Resolves once rendering inside `el` has settled: two layout frames, then any images, then DOM quiescence (for asynchronous diagram swaps such as Mermaid), each bounded by `maxMs` (default 2500 ms). `quietMs` (default 120 ms) is how long the subtree must stay unchanged. Keep your own deadline on top of it.

### `exportCanvas(el, options?): Promise<VizardryExportResult>`

Captures one rendered canvas.

Requirements: `el` must be connected to the document and laid out with a non-zero width. An offscreen host is fine; `display: none` and detached nodes are not. Vizardry mounts nothing itself, the caller owns the render host.

Guarantees: buttons and controls are never captured; the title row is captured unless `header: false`; a collapsed canvas is un-collapsed for the capture; the live canvas is restored exactly whatever happens; concurrent calls are serialised.

#### Options

| Option | Default | Meaning |
|---|---|---|
| `format` | `"png"` | Only PNG today. Another format would arrive as a new accepted value. |
| `scale` | `2` | Device pixels per CSS pixel, clamped to `[0.25, 4]`. |
| `maxEdge` | `8000` | Ceiling on the longer edge in pixels. The scale is reduced to fit; only if even the lowest scale would exceed it does the export reject with `too-large`. |
| `light` | `true` | Capture as if the light theme were active, whatever the vault uses. A canvas is nearly always going onto white paper. |
| `background` | `"#ffffff"` | Colour painted behind the canvas. |
| `header` | `true` | Keep the canvas's own title row. Pass `false` when your document supplies its own caption. |

#### Result

| Field | Meaning |
|---|---|
| `blob` | The PNG. |
| `width`, `height` | Actual pixel dimensions of the image. |
| `scale` | The scale actually used; below the requested one when `maxEdge` bit. |
| `format` | `"png"`. |
| `title` | The canvas's displayed title, as a caption fallback. Empty when it has none. |

#### Errors

`exportCanvas` rejects with a `VizardryExportError` whose `code` is one of:

| Code | Meaning |
|---|---|
| `not-a-canvas` | The element is not a Vizardry canvas root. |
| `not-rendered` | The element is not in the document, so it has no layout to capture. |
| `capture-failed` | The underlying capture failed or produced nothing. `cause` carries the original error. |
| `too-large` | Even the lowest fallback scale would exceed `maxEdge`. |

## Typical flow

```ts
host.classList.add(api.noEnrichClass);
await MarkdownRenderer.render(app, markdown, host, sourcePath, component);
await api.whenSettled(host);
for (const canvas of api.getCanvases(host)) {
  try {
    const { blob, width, height, title } = await api.exportCanvas(canvas, { maxEdge: 4000 });
    placeImage(blob, width, height, title);
  } catch (err) {
    if (err instanceof Error && "code" in err) fallbackCapture(canvas);
    else throw err;
  }
}
```
