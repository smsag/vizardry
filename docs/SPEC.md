# Vizardry — Product Specification

## Vision

A lightweight Obsidian plugin that lets product managers, founders, and strategists embed visual PM frameworks directly in their notes — without leaving the writing environment, without external tools, without managing separate files.

Write structured text. Get a rendered canvas.

---

## Problem

Product managers use Obsidian for notes but work with frameworks (BMC, Lean Canvas, Impact Maps, Wardley Maps) in separate tools — Miro, Figma, Notion, Mural. Context is split. Updates to the canvas don't live near the thinking that produced them. There is no plain-text-native way to capture a framework that renders visually, stays version-controlled, and remains editable without a proprietary tool.

---

## Users

**Primary**: Product managers, founders, and product strategists who use Obsidian as their primary thinking environment.

**Secondary**: Consultants and coaches who share Obsidian vaults with clients.

---

## How it works

Users write a fenced code block with the framework name as the language tag:

````
```bmc
block: Value Propositions
  Save 3 hours per week on reporting
  No-code setup for non-technical users
```
````

In Read View and Live Preview, the plugin intercepts the code block and renders it as a visual canvas in place. The source block remains editable as plain text. In Live Preview, grid canvas blocks can be clicked to edit inline — changes write back to the source automatically.

---

## Supported frameworks

| Code block | Framework | Type | Author / Source |
|---|---|---|---|
| `adkar` | ADKAR Model | Grid | Prosci |
| `bmc` | Business Model Canvas | Grid | Osterwalder, Strategyzer |
| `fourls` | 4Ls Retrospective | Grid | — |
| `impact` | Impact Map | Tree | Gojko Adzic |
| `jobs` | Jobs Canvas | Grid | Alan Klement |
| `kata` | Product Kata | Grid | Mike Rother (adapted) |
| `lean` | Lean Canvas | Grid | Ash Maurya |
| `leanux` | Lean UX Canvas | Grid | Jeff Gothelf |
| `mindmap` | Mind Map | Tree | — |
| `opportunity` | Opportunity Canvas | Grid | Josh Seiden |
| `ost` | Opportunity Solution Tree | Tree | Teresa Torres |
| `rac` | Riskiest Assumptions Canvas | Grid | — |
| `sipoc` | SIPOC Diagram | Table | — |
| `sipoc` (type: flow) | SIPOC Flow Diagram | SVG | — |
| `story` | User Story Map | Grid | Jeff Patton |
| `swot` | SWOT Analysis | Grid | — |
| `vpc` | Value Proposition Canvas | Grid | Osterwalder, Strategyzer |
| `venn` | Venn Diagram | SVG | — |
| `wardley` | Wardley Map | SVG | Simon Wardley |
| `carousel` | Image Carousel | — | — |

---

## Syntax specification

### Grid canvases (adkar, bmc, fourls, jobs, kata, lean, leanux, opportunity, rac, swot, vpc)

Each section starts with `block: <Label>` (matching the framework's defined block labels, case-insensitive). Content follows on indented lines. Multiple items: one per line.

```
block: Value Propositions
  Save 3 hours per week on reporting
  No-code setup for non-technical users
  Works on mobile

block: Customer Segments
  Early-stage SaaS teams
```

**Heading links** — any block can navigate to a heading in the same note. Two ways to connect them:

*Inline annotation* — append `[[#Heading text]]` to the block declaration:

```
block: Value Propositions [[#Value Prop Research]]
  Save 3 hours per week

block: Customer Segments [[#Customer Discovery]]
  Early-stage SaaS teams
```

*Auto-detection* — if a note heading exactly matches a block label (case-insensitive), the link icon appears automatically with no extra syntax needed.

Both approaches work for grid canvases, OST, Impact Map, and Mind Map. Inline annotations take priority over auto-detected matches.

ADKAR uses the same grid syntax with five blocks:

```
block: Awareness
  Why this change matters now

block: Desire
  Why people want to adopt the change

block: Knowledge
  What people need to know to execute

block: Ability
  What people can now do in practice

block: Reinforcement
  How the change is sustained over time
```

### Impact Map

Indented keyword tree. Depth is determined by the keyword level, not indentation count.

```
goal: Measurable outcome here

actor: Person or system
  impact: Behaviour change needed from this actor
    deliverable: Feature or output that enables it
    deliverable: Another feature
```

Multiple actors, impacts, and deliverables are supported. Indentation within a level is cosmetic.

### User Story Map

Horizontal user journey with vertical priority slices.

```
user: Persona name
goal: What this persona is trying to achieve

activity: High-level user activity
  step: A step within that activity
    task: Concrete story | acceptance note
    task: Another story

slice: MVP
  step: Step name | Task 1, Task 2
```

### Mind Map

Free indentation tree around a central topic.

```
root: Central Topic

  Branch One
    Sub-item A
    Sub-item B

  Branch Two
    Nested Group
      Deep Item
```

### Opportunity Solution Tree

```
outcome: Desired outcome

  Opportunity one
    Solution A
      Experiment 1
    Solution B

  Opportunity two
    Solution C
```

Depth: `outcome` → opportunities → solutions → experiments. Determined by indentation.

### Venn Diagram

```
circle: Design
  - User research
  - Wireframing

circle: Engineering
  - Architecture

intersection: Design+Engineering
  - Prototyping
  - [[Note Title|Shared components]]

center:
  - Product vision
```

Circle names in `intersection:` must exactly match the `circle:` names. Supports Obsidian `[[wikilinks]]` inside items.

### SIPOC Diagram

Row-wise: each `row:` block is one supplier-to-customer path.

```
row:
  supplier: Dev team
  input: Feature branch
  process: Build & test
  output: Running service
  customer: End users
```

All five keys are optional; missing keys render as `—`.

### SIPOC Flow Diagram

Use `type: flow` as the first line inside a `sipoc` block.

```
type: flow

suppliers:
  Supplier A [ellipse]

inputs:
  Data file [parallelogram]

process:
  Step 1 [rect]
  Step 2 [rect]

outputs:
  Report [parallelogram]

customers:
  Manager [ellipse]

link: Supplier A -> Data file
link: Data file -> Step 1
link: Step 1 -> Step 2
link: Step 2 -> Report
link: Report -> Manager
```

Node shapes: `rect` (process steps), `ellipse` (people/organisations), `parallelogram` (data/documents).

### Wardley Map

```
stages: Driver | Approver | Contributor | Informed

anchor: User

component: User       [1.00, 0.05]
component: Web App    [0.85, 0.40]
component: Database   [0.40, 0.65]

link: User -> Web App
link: Web App -> Database
```

Coordinates: `[visibility, evolution]`, both 0.0–1.0. Visibility 1.0 = directly user-facing. Evolution 1.0 = commodity/utility.

Optional custom stage labels:
- `stages: Label A | Label B | ...` overrides the default Genesis/Custom/Product/Commodity labels.
- At least two labels are required.
- If `stages:` is omitted, the default localised labels are rendered.

Optional positioned stages (normalised x-axis):

```
stages:
  0.05: Driver
  0.28: Approver
  0.62: Contributor
  0.95: Informed
```

- Positions must be numbers strictly between 0 and 1.
- Positions must be strictly increasing and unique.
- Labels render centered within each interval defined by the positions.

### Image Carousel

```
![](image-one.png)
![](image-two.png)
![](image-three.png)
```

Standard Markdown image syntax, one per line. Paths are resolved relative to the note's location in the vault.

### Parser rules (all frameworks)

| Input | Behaviour |
|---|---|
| `# line` | Comment — ignored |
| Blank line | Ignored |
| Unknown key | Silently ignored |
| Duplicate key | Last value wins |
| Malformed line | Returns `{ ok: false, error }` — shown as inline error |

---

## Features

### Canvas rendering
All frameworks render as HTML/CSS grids, SVG diagrams, or HTML tables in Read View and Live Preview. Source block is always accessible in editing mode.

### Inline block editing
In Live Preview, clicking any grid canvas block body opens an inline textarea. Blur commits the edit; the change is written directly to the source code block. Escape discards.

### PNG export
Every canvas has a download button (revealed on hover in the canvas header). Exports at 2× pixel ratio using `html-to-image`. No per-framework configuration needed.

### Presentation mode
An expand button on each canvas opens a fullscreen overlay covering the entire Obsidian UI. Designed for screen mirroring to external displays. Dismiss with ✕, Escape, or swipe down.

### Mobile carousel
On viewports ≤ 600px, grid canvases switch to a single-block carousel with prev/next buttons, dot indicators, and swipe navigation.

### Framework insert modal
Command palette entry "Insert canvas…" opens a fuzzy-search modal listing all frameworks with descriptions. Inserts a complete empty template at the cursor.

### Per-framework insert commands
One command per framework in the command palette: "Insert Business Model Canvas", "Insert Wardley Map", etc.

### Heading links
Any canvas element can link to a heading in the same note. Three mechanisms:
- **Inline wiki-link** — `[[#Heading]]` appended to any keyword line (e.g. `block: Value Propositions [[#VP Research]]`, `actor: Paid Users [[#Research]]`)
- **Inline Markdown link** — `[label](#Anchor%20Text)` appended to any keyword line; the anchor is URL-decoded to recover the heading text (e.g. `block: Next Experiment [Next Experiment](#Next%20Experiment)`)
- **Auto-detection** — a heading whose text exactly matches an element label gets a link icon automatically with no extra syntax; link icons update live when headings change without requiring any edit to the code block

Works for grid canvases, OST, Impact Map, and Mind Map. Clicking a block or node navigates to the matched heading. Inline annotations take priority over auto-detection.

### Font size controls
Each canvas header has increase/decrease font size buttons, affecting only that canvas instance.

---

## Non-goals

- **Collaboration**: no multi-user, no sync, no sharing features
- **Custom framework definitions**: no user-defined block structures in settings (planned for roadmap)
- **External data connections**: no live data, no API-fed canvases
- **AI generation**: generation is out of scope; the plugin renders what the user writes
- **General diagramming**: no flowcharts, ERDs, sequence diagrams, or freehand drawing
- **Write-back for non-grid canvases**: SVG and tree canvases (Wardley excepted, SIPOC Flow, OST, etc.) are read-only; inline editing is available for grid canvases and User Story Maps

---

## Constraints

- **Obsidian API only** — `html-to-image` is the only runtime dependency
- **CSS variables only** — full light/dark theme compatibility required; no hardcoded colours
- **No external network calls** — plugin works fully offline
- **No innerHTML** — all DOM construction via Obsidian's `createEl` API to prevent XSS
- **No eval()** — forbidden
- **Conflict-safe** — all selectors scoped to `.vizardry-*` or `.vzd-*`; no global style overrides
- **Mobile-compatible** — no desktop-only APIs; tested on iOS Obsidian ≥ 1.11.4

---

## Version history

| Version | Features |
|---|---|
| Unreleased | - |
| 0.23.0 | User Story Map full Live Edit: inline rename of `user`/`goal`/`activity`/`step`/`task`; cross-column task drag; cancel-on-release outside grid. Fix: `[text](#Anchor)` Markdown links now work as block annotations alongside `[[#Heading]]`. Fix: silent linker updates live via `metadataCache.on('changed')` — no code block re-render needed when headings change |
| 0.22.0 | User Story Map editable in Live Preview: add task cards via `+` button; drag to reorder within and across slice bands; drag between step columns updates task declarations and slice cell references. Fix: Wardley Map drag-to-add creates an arrow by default |
| 0.21.0 | ADKAR Model grid canvas (`adkar`); Wardley visual editing improvements (inline rename, add-gesture semantics, unique default names); parser comment syntax standardized to `//` |
| 0.1.0 | BMC, Lean Canvas |
| 0.2.0 | Opportunity Canvas, Lean UX Canvas, VPC, Product Kata, Jobs Canvas, Impact Map |
| 0.3.0 | Design improvements: unified visual style, Impact Map hierarchy |
| 0.4.0 | `_links:` heading navigation |
| 0.5.0 | Canvas insert modal, per-framework commands, ribbon icon |
| 0.6.0 | Presentation mode (fullscreen overlay) |
| 0.7.0 | Design polish: label truncation, touch targets, dot indicators |
| 0.8.0–0.15.0 | User Story Map, Mind Map, OST, Venn Diagram, SIPOC (original), Image Carousel, Riskiest Assumptions Canvas |
| 0.16.0 | PNG export, renderer split, strict TypeScript, Vitest CI, MediaQueryList fix |
| 0.17.0 | SWOT Analysis, Wardley Map, SIPOC row-wise syntax rewrite, SIPOC Flow diagram, inline block editing, hanging indent |
| 0.18.0 | 4Ls Retrospective canvas, i18n layer (English + German), Venn top-circle label fix |
| 0.18.1 | Renderer smoke tests (170 total), lazy-load html-to-image, generic Result<T> type, onDisconnected lifecycle utility, locale memoisation, story card dedup fix |
| 0.20.3 | Wardley Map custom x-axis stage labels via `stages:` directive (simple and positioned modes) |
| 0.19.0 | Heading links (inline [[#Heading]] + auto-detection), OST/Impact Map visual alignment, Wardley Map drag-to-reposition + add-by-dragging |
| 0.20.0 | Wardley Map rename in-place, versions.json, coverage thresholds, branch protection |
| 0.20.1 | Wardley Map label nudge cap + leader lines, docs-check CI step, README Wardley editing section |
| 0.18.0 | 4Ls Retrospective canvas, i18n layer (English + German), Venn top-circle label fix |
| 0.18.1 | Renderer smoke tests (134 total), lazy-load html-to-image, generic Result<T> type, onDisconnected lifecycle utility, locale memoisation, resetInteractiveIdCounter, story card dedup fix, constants extraction, SIPOC Flow in insert modal, Wardley label nudge pass |

---

## Roadmap

| Feature | Notes |
|---|---|
| Wardley Map — delete component | Visual deletion to complement drag/add/rename |
| Story Map — delete task / step / activity | Complement the existing add/rename/move interactions |
| Heading links — Wardley, Venn, SIPOC | Foundation in `shared/links.ts`; renderers need wiring |
| Search / filter within canvases | Useful for long Story Maps |
| Collapsible blocks in grid canvases | Reduce visual noise in dense BMCs |
| Wardley Map annotations | Evolution arrows, inertia markers |
| SIPOC Flow auto-layout | Remove need for manual `link:` directives |
| Custom framework definitions | User-defined grid canvases in plugin settings |
| Community template library | Browse and import filled framework examples |
| Multi-root Mind Map | Forest layout for parallel topic clusters |
