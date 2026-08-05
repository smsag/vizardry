---
type:
  - Essential Doc
---
Vizardry renders fenced code blocks as visual canvases in Obsidian Live Preview and Reading View. Use this file as the **authoritative, copy-paste-ready** syntax reference when generating any Vizardry canvas. Everything here matches plugin **v0.45.1**.

> **If you are an LLM generating a canvas:** read "Hard rules for generating valid syntax" first, then copy the matching framework example and change only the text values. Do not invent keywords, do not reorder the axis grammar, and keep the exact ` ```vizardry ` fence.

---

## Hard rules for generating valid syntax

These are the rules that most often get broken. Follow all of them:

1. **One fence, always:** open with ` ```vizardry ` and close with ` ``` `. Never use a per-framework fence like ` ```bmc ` or ` ```wardley ` — those render as plain code blocks (no migration).
2. **`type:` is required** and must be the framework id, optionally `id, variant` (one comma), e.g. `type: bmc` or `type: matrix, pain`. If it's missing you get `Missing required "type:" line`. An unknown id gives `Unknown type "<id>"`.
3. **Indentation is structural.** Child lines are indented under their parent with a **consistent** unit (2 spaces recommended). Mixing indent widths inside one block causes an "unexpected indentation" error. Use spaces, not tabs, to be safe.
4. **Keywords end with a colon** (`block:`, `item:`, `component:`, `phase:`, …) except the free-graph lines in `conceptmap` and the bullet/indent-only lines in `mindmap`/`ost`/`venn`.
5. **Full-line comments only.** A line whose first non-space characters are `//` is ignored, in every framework. Inline trailing `// …` comments are only stripped in `wardley` and `pacelayers` — do **not** rely on them elsewhere; put comments on their own line.
6. **Blank lines are always ignored** — use them freely for readability.
7. **Grid block labels must match the framework's list exactly** (case-insensitive). A typo'd label is silently dropped (the block just stays empty).
8. **Don't quote values.** Write `title: My Map`, not `title: "My Map"`. No YAML, no JSON — this is a line-based mini-language.
9. **One `type:` line, one `title:` line.** Extra top-level lines a framework doesn't recognise cause an "unexpected syntax" error (grid frameworks are the exception — they ignore unknown top-level lines that aren't `block:`).

---

## Global rules (every canvas)

- **Fence:** ` ```vizardry ` — always.
- **`type: <id>`** or **`type: <id>, <variant>`** — required. Order relative to other top-level lines doesn't matter, but it must exist.
- **`title: My Title`** — optional everywhere; editable in Live Preview.
- **Comments:** `// comment` on its own line (full-line only; see rule 5).
- **Blank lines:** ignored.
- **Heading / ticket links:** append `[[#Heading]]`, `[text](#Anchor)`, or `[text](TICKET-123)` to an element label (see "Links" near the end).
- **`collapsed: true`** — optional top-level line; starts the canvas minimized (also written back by the minimize button).

---

## Framework index

| `type:` value | Canvas | Kind |
| --- | --- | --- |
| `adkar` | ADKAR Change Model | Grid |
| `bmc` | Business Model Canvas | Grid |
| `experiment` | Experiment Canvas | Grid |
| `fourls` | 4Ls Retrospective | Grid |
| `jobs` | Jobs Canvas | Grid |
| `kata` | Product Kata | Grid |
| `lean` | Lean Canvas | Grid |
| `leanux` | Lean UX Canvas | Grid |
| `opportunity` | Opportunity Canvas | Grid |
| `ptw` | Playing to Win | Grid |
| `rac` | Riskiest Assumptions Canvas | Grid |
| `swot` | SWOT Analysis | Grid |
| `vpc` | Value Proposition Canvas | Grid |
| `story` | User Story Map | Grid |
| `matrix` | Blank matrix (needs `x:`/`y:`) | Matrix |
| `matrix, pain` | Pain Point Matrix (4×4 preset) | Matrix |
| `matrix, opportunity` | Opportunity Matrix (4×4 preset) | Matrix |
| `matrix, impact` | Impact / Effort Matrix (4×4 preset) | Matrix |
| `matrix, assumption` | Assumption Map (4×4 preset) | Matrix |
| `matrix, scenario` | Scenario Matrix (2×2 preset) | Matrix |
| `scqa` | SCQA Narrative | Grid / Tree |
| `scr` | SCR Narrative | Grid / Tree |
| `carousel` | Image Carousel | Gallery |
| `conceptmap` | Concept Map | SVG graph |
| `nodemap` | Node Map | SVG graph |
| `fishbone` | Fishbone Diagram | SVG tree |
| `impact` | Impact Map | SVG tree |
| `mindmap` | Mind Map | SVG tree |
| `ost` | Opportunity Solution Tree | SVG tree |
| `pacelayers` / `pacelayers, product` / `pacelayers, retro` | Pace Layer Analysis | SVG layers |
| `raci` | RACI Matrix | Table |
| `roadmap` | Now/Next/Later Roadmap | Table |
| `sipoc` / `sipoc, table` | SIPOC Diagram | Table |
| `sipoc, flow` | SIPOC Diagram (flow view) | SVG flow |
| `journey` | Customer Journey Map | Lanes |
| `journey, blueprint` | Service Blueprint | Lanes |
| `venn` | Venn Diagram | SVG overlap |
| `wardley` | Wardley Map | SVG canvas |
| `wheeloflife` | Wheel of Life | SVG wheel |
| `odyssey` | Odyssey of Life | Plan cards |
| `circleofinfluence` | Circle of Influence & Concern | Concentric rings |
| `wholeperson` | Whole Person / Four Dimensions | SVG wheel + cards |

---

## Grid canvases

All grid canvases share one syntax: `block: <Label>` with content lines indented below it. **Block labels must match the framework's defined names exactly** (listed per framework). Blocks may appear in any order.

```
type: <framework-id>
block: <Exact Label>
  Content line 1
  Content line 2
```

**Card mode (optional):** append `| card` to a block to render each of its indented lines as a draggable card instead of plain text (`block: Label | card`); or set `cards: all` once at the top level to make every block card mode. Card-mode blocks support drag-to-reorder in Live Preview.

### ADKAR Change Model (`adkar`)

Blocks: `Awareness` · `Desire` · `Knowledge` · `Ability` · `Reinforcement`

~~~
```vizardry
type: adkar
title: ADKAR Change Model
block: Awareness
  Why the change is needed and why now

block: Desire
  Personal motivation to support and participate

block: Knowledge
  How to change — skills, behaviours, processes

block: Ability
  Demonstrated capability to implement day-to-day

block: Reinforcement
  Mechanisms to sustain the change over time
```
~~~

### Business Model Canvas (`bmc`)

Blocks: `Key Partners` · `Key Activities` · `Key Resources` · `Value Propositions` · `Customer Relationships` · `Channels` · `Customer Segments` · `Cost Structure` · `Revenue Streams`

~~~
```vizardry
type: bmc
title: Business Model Canvas
block: Key Partners
  Suppliers, cloud provider, payment processor

block: Key Activities
  Product development, support, marketing

block: Key Resources
  Engineering team, brand, platform IP

block: Value Propositions
  Save 4 hours per week on reporting

block: Customer Relationships
  Self-service SaaS, in-app support chat

block: Channels
  App store, SEO, word of mouth

block: Customer Segments
  Ops managers at 20–200 person SaaS companies

block: Cost Structure
  Engineering salaries, cloud hosting, marketing

block: Revenue Streams
  Monthly subscription, annual plans
```
~~~

### Experiment Canvas (`experiment`)

Blocks: `Hypothesis` · `Test` · `Metric` · `Success Criteria` · `Observation` · `Learning` · `Decision`

~~~
```vizardry
type: experiment
title: Experiment Canvas
block: Hypothesis
  We believe a guided wizard will raise activation

block: Test
  Ship a 5-step wizard to 50% of new signups

block: Metric
  % of signups completing setup in 14 days

block: Success Criteria
  Uplift of 10 percentage points vs control

block: Observation
  Completion rose from 32% to 45%

block: Learning
  Step 3 (integrations) is the main drop-off

block: Decision
  Persevere; simplify the integrations step next
```
~~~

### 4Ls Retrospective (`fourls`)

Blocks: `Liked` · `Learned` · `Lacked` · `Longed For` · `Actions`

~~~
```vizardry
type: fourls
title: 4Ls Retrospective
block: Liked
  Fast CI pipeline
  Clear sprint goal

block: Learned
  Smaller PRs get reviewed faster

block: Lacked
  Earlier design involvement

block: Longed For
  Dedicated tech-debt time each sprint

block: Actions
  Add tech-debt items to the sprint backlog
```
~~~

### Jobs Canvas (`jobs`)

Blocks: `Job Performer` · `Main Job` · `Circumstances` · `Functional Aspects` · `Emotional Aspects` · `Social Aspects` · `Current Solutions` · `Desired Outcomes` · `Obstacles`

~~~
```vizardry
type: jobs
title: Jobs Canvas
block: Job Performer
  Operations manager at a 50-person B2B SaaS company

block: Main Job
  Produce accurate weekly reports without stress

block: Circumstances
  End of week, time pressure, data across three tools

block: Functional Aspects
  Pull data, calculate KPIs, format, distribute by Friday

block: Emotional Aspects
  Wants control; fears sending a report with a mistake

block: Social Aspects
  Known as "the one who always has the numbers"

block: Current Solutions
  Excel + manual copy-paste + PowerPoint

block: Desired Outcomes
  Done in 30 minutes, no errors, no chasing people

block: Obstacles
  No shared export format across tools
  KPI definitions inconsistent across departments
```
~~~

### Product Kata (`kata`)

Blocks: `Current Condition` · `Target Condition` · `Obstacles` · `Next Experiment` · `Expected Outcome`

~~~
```vizardry
type: kata
title: Product Kata
block: Current Condition
  Onboarding takes 3 days and needs CS handholding

block: Target Condition
  New users reach first value within 30 minutes, unassisted

block: Obstacles
  No in-app guidance
  Setup requires 12 manual steps

block: Next Experiment
  Ship a 5-step guided wizard for the top job-to-be-done

block: Expected Outcome
  40% complete setup without support in 14 days
```
~~~

### Lean Canvas (`lean`)

Blocks: `Problem` · `Solution` · `Unique Value Proposition` · `Unfair Advantage` · `Customer Segments` · `Key Metrics` · `Channels` · `Cost Structure` · `Revenue Streams`

~~~
```vizardry
type: lean
title: Lean Canvas
block: Problem
  Manual reporting consumes 4+ hours per week

block: Solution
  One-click automation for recurring reports

block: Unique Value Proposition
  10× faster than the current status quo

block: Unfair Advantage
  Proprietary dataset and 3-year head start

block: Customer Segments
  Ops managers at SMB SaaS companies

block: Key Metrics
  DAU, activation rate, monthly churn

block: Channels
  Product Hunt, SEO, word of mouth

block: Cost Structure
  Engineering salaries, cloud hosting

block: Revenue Streams
  Monthly SaaS subscription
```
~~~

### Lean UX Canvas (`leanux`)

Blocks: `Business Problem` · `Business Outcomes` · `Users` · `User Outcomes & Benefits` · `Solutions` · `Hypotheses` · `Most Important Thing to Learn First` · `Minimum Experiment`

~~~
```vizardry
type: leanux
title: Lean UX Canvas
block: Business Problem
  Users drop off during onboarding before first value

block: Business Outcomes
  Increase 7-day retention by 20%

block: Users
  First-time SaaS buyers with no technical background

block: User Outcomes & Benefits
  Feel confident and productive within 10 minutes

block: Solutions
  Guided wizard, contextual tooltips, sample data

block: Hypotheses
  If we add a guided wizard, users reach value faster

block: Most Important Thing to Learn First
  Do users abandon because setup feels overwhelming,
  or because they don't see the value of finishing?

block: Minimum Experiment
  A/B test: guided wizard vs blank start, 500 signups
```
~~~

### Opportunity Canvas (`opportunity`)

Blocks: `Problem / Opportunity` · `Solution Ideas` · `Target Users` · `User Outcomes` · `User Metrics` · `Business Problem` · `Business Metrics` · `Budget` · `Adoption Factors` · `Factors for Success`

~~~
```vizardry
type: opportunity
title: Opportunity Canvas
block: Problem / Opportunity
  Manual reporting consumes 4+ hours per week

block: Solution Ideas
  Automated generation, smart templates, one-click export

block: Target Users
  Operations managers at 20–200 person companies

block: User Outcomes
  Reclaim time, reduce errors, look credible

block: User Metrics
  Hours saved per week, error rate, turnaround time

block: Business Problem
  High churn from power users citing workflow friction

block: Business Metrics
  30-day churn, feature adoption, support ticket volume

block: Budget
  2 engineers, 1 designer, 1 quarter

block: Adoption Factors
  In-app prompt after third manual export

block: Factors for Success
  Low setup friction, works with existing tools
```
~~~

### Playing to Win (`ptw`)

Blocks: `Winning Aspiration` · `Strategic Issue` · `Where To Play` · `How To Win` · `Capabilities Needed` · `Systems Required` · `Reverse Engineering` · `Strategic Tests`

~~~
```vizardry
type: ptw
title: Playing to Win
block: Winning Aspiration
  Be the most trusted tool for distributed engineering teams

block: Strategic Issue
  Growth has stalled; competitors moving down-market

block: Where To Play
  Mid-market engineering teams (20–200 devs), NA + N. Europe

block: How To Win
  Fastest time-to-value: zero-config setup, native integrations

block: Capabilities Needed
  World-class onboarding UX
  Real-time collaborative sync engine

block: Systems Required
  Weekly user-interview cadence
  Integration marketplace governance

block: Reverse Engineering
  Teams pay a premium for simplicity over feature breadth

block: Strategic Tests
  'Integration depth is defensible' — map competitor roadmaps
```
~~~

### Riskiest Assumptions Canvas (`rac`)

Blocks: `Customers` · `Problem` · `Solution` · `MVP` · `Competition` · `Sales Channels` · `Top Riskiest Assumptions`

Rate each: **P** = probability of being wrong (1–5), **I** = impact if wrong (1–10). Risk = P × I (free text, not parsed specially).

~~~
```vizardry
type: rac
title: Riskiest Assumptions Canvas
block: Customers
  Ops managers at SMB SaaS companies — P:4 I:9 Risk:36

block: Problem
  Manual reporting is the primary pain — P:3 I:9 Risk:27

block: Solution
  One-click automation solves the core pain — P:3 I:8 Risk:24

block: MVP
  Export automation alone validates value — P:4 I:8 Risk:32

block: Competition
  No competitor owns the SMB niche — P:3 I:7 Risk:21

block: Sales Channels
  Product-led growth drives acquisition — P:4 I:8 Risk:32

block: Top Riskiest Assumptions
  1. Ops managers are the right buyer (Risk: 36)
  2. PLG drives sufficient acquisition (Risk: 32)
```
~~~

### SWOT Analysis (`swot`)

Blocks: `Strengths` · `Weaknesses` · `Opportunities` · `Threats`

~~~
```vizardry
type: swot
title: SWOT Analysis
block: Strengths
  Strong brand recognition
  Experienced engineering team

block: Weaknesses
  Limited marketing budget
  No enterprise sales motion yet

block: Opportunities
  Growing demand for async collaboration
  Untapped international markets

block: Threats
  Well-funded competitors entering the space
  Possible API pricing changes from a key dependency
```
~~~

### Value Proposition Canvas (`vpc`)

Blocks: `Products & Services` · `Pain Relievers` · `Gain Creators` · `Customer Jobs` · `Pains` · `Gains`

~~~
```vizardry
type: vpc
title: Value Proposition Canvas
block: Products & Services
  Automated reporting suite
  One-click export to PDF and Slides

block: Pain Relievers
  Eliminates manual data gathering and formatting

block: Gain Creators
  Polished reports ready in seconds instead of hours

block: Customer Jobs
  Produce accurate weekly reports for leadership

block: Pains
  Repetitive, error-prone work that eats Friday afternoons

block: Gains
  Look credible and prepared in front of the CEO
```
~~~

### User Story Map (`story`)

A backbone of `activity:` → `step:` → `task:`, plus optional `slice:` priority bands. `step:` names must be **unique across the whole map**.

~~~
```vizardry
type: story
title: User Story Map
user: Team Lead
goal: Coordinate team and ship features reliably

activity: Define
  step: Backlog
    task: Create ticket | title and acceptance criteria
    task: Estimate | story points via planning poker
  step: Sprint Planning
    task: Build sprint | drag tickets from backlog

activity: Build
  step: Development
    task: Start work | move ticket to in-progress
    task: Open PR | linked to ticket
  step: Review
    task: Approve | or request changes
    task: Merge | squash and merge to main

slice: MVP
  step: Backlog | Create ticket
  step: Development | Start work, Open PR
  step: Review | Approve, Merge

slice: V1.1
  step: Backlog | Estimate
  step: Sprint Planning | Build sprint
```
~~~

| Key | Meaning |
| --- | --- |
| `user:` / `goal:` | Optional header persona / objective |
| `activity: <name>` | Backbone group spanning its step columns |
| `step: <name>` | One grid column — unique across all activities |
| `task: <name>` | Task card |
| `task: <name> \| <subtitle>` | Task card with a subtitle line |
| `slice: <name>` | Priority band |
| `step: <name> \| taskA, taskB` | Assigns tasks (by name) to the slice band |

Tasks not assigned to any slice appear in a **Backlog** band at the bottom.

---

## Matrix (`matrix` + presets)

A matrix is **two tick-labelled axes forming a grid of cells, plus items placed on the plane.** One engine, five presets. This section replaces all older matrix syntax (`block: very-major-1`, `zone:`, `layout: plot`, `type: scenario`, `x-axis:` — **all removed**, no migration).

### The model

- `type: matrix` → blank matrix; **you must supply `x:` and `y:` axes.**
- `type: matrix, <preset>` → preset supplies default axes + colour + heat. Presets: `pain`, `opportunity`, `impact`, `assumption` (all default to a **4×4** grid) and `scenario` (defaults to **2×2**). You may still override the axes with your own `x:`/`y:`.
- **Axes:** `x: Title | tick | tick | …` (ticks left→right) and `y: Title | tick | tick | …` (ticks **bottom→top**). N x-ticks × M y-ticks = an **N×M** grid of cells.
- **Cells** are auto-numbered `t1 … t(N·M)` in reading order — **t1 = top-left**, increasing left→right then top→bottom.
- `tN: Name | heat` — optionally name and/or tint a cell. `heat` ∈ `very-high` `high` `medium` `low`. Either part is optional (`t1: Do first`, `t4: | low`, or `t1: Do first | very-high`).
- **Items** are cards placed either at a **free coordinate** `item: Label [x, y]` (x,y in `0…1`, **origin bottom-left**, so `[1,1]` is top-right) or **snapped to a cell** `item: Label at: tN`. Indented lines under an item become its card body. **Item labels must be unique** within the matrix.

### Cell numbering

4×4 preset (t1 = top-left):

```
t1   t2   t3   t4
t5   t6   t7   t8
t9   t10  t11  t12
t13  t14  t15  t16
```

2×2 (scenario):

```
t1  t2
t3  t4
```

### Preset default axes (when you don't override them)

| Preset | Grid | y (top→bottom) | x (left→right) | Priority corner |
| --- | --- | --- | --- | --- |
| `pain` | 4×4 | Very Major → Very Minor **Pain** | Mentioned by Everyone → Few | `t1` (top-left) |
| `opportunity` | 4×4 | Very Major → Very Minor **Benefit** | Low → Very High **Effort** | `t1` |
| `impact` | 4×4 | Very High → Very Low **Impact** | Very Low → Very High **Effort** | `t1` |
| `assumption` | 4×4 | Very High → Very Low **Importance** | No → Strong **Evidence** | `t1` (test riskiest first) |
| `scenario` | 2×2 | Uncertainty B: High / Low | Uncertainty A: Low / High | none (no heat) |

Presets auto-colour their cells by heat; `scenario` has no heat (name the four cells yourself).

### Example — preset with items snapped to cells

~~~
```vizardry
type: matrix, impact
title: Q3 Prioritisation

item: Fix mobile checkout at: t1
  Wallet payments rejected
item: Saved filter presets at: t2
item: AI task summaries at: t7
item: On-prem deployment at: t16
item: Dark mode [0.28, 0.24]
```
~~~

(`at: t1` snaps to the top-left/high-impact-low-effort cell; the last item uses a free `[x, y]` coordinate instead.)

### Example — Assumption Map

~~~
```vizardry
type: matrix, assumption
title: Riskiest Assumptions

item: Users will pay monthly at: t1
  No pricing tests yet
item: Buyers self-onboard at: t2
item: Prefer usage-based pricing at: t7
item: Want dark mode at: t13
```
~~~

### Example — Scenario Matrix (custom 2×2 axes + named cells)

~~~
```vizardry
type: matrix, scenario
title: Future of Work 2030

x: AI capability | Assistive | Autonomous
y: Regulation | Light-touch | Strict

t1: Wild West
t2: Compliance moat
t3: Copilot era
t4: Licensed autonomy

item: Agents everywhere at: t1
  Few guardrails
item: Audit + certification at: t2
item: Humans in the loop at: t3
item: Certified niche agents at: t4
```
~~~

### Example — blank matrix with custom axes, heat, and free-coordinate scatter

~~~
```vizardry
type: matrix
title: Effort vs Reach

x: Effort | Low | High
y: Reach | Narrow | Wide

t1: Do first | very-high
t4: Skip | low

item: Fix mobile checkout [0.15, 0.9]
  Wallet payments rejected
item: AI summaries [0.7, 0.8]
item: On-prem deploy [0.88, 0.3]
```
~~~

### Matrix syntax table

| Key | Meaning |
| --- | --- |
| `type: matrix` | Blank matrix — you must add `x:` and `y:` |
| `type: matrix, <preset>` | `pain` · `opportunity` · `impact` · `assumption` · `scenario` |
| `x: Title \| a \| b \| …` | X axis: title then ticks left→right |
| `y: Title \| a \| b \| …` | Y axis: title then ticks **bottom→top** |
| `tN: Name \| heat` | Name/tint a cell; `heat` ∈ `very-high`/`high`/`medium`/`low` (both parts optional) |
| `item: Label at: tN` | Card snapped to cell `tN`'s centre |
| `item: Label [x, y]` | Card at free coordinate, `x,y` in 0…1, **origin bottom-left** |
| (indented lines under `item:`) | Card body text |

**Matrix gotchas:** cell ids only go up to `t(cols·rows)` — referencing `t17` on a 4×4 errors. Item labels must be unique. Put a link annotation (`[[#Heading]]` / `[text](TICKET)`) **before** the `[x,y]` or `at:` token, e.g. `item: Fix login [Fix login](CORE-1234) at: t1`.

---

## SCQA / SCR Narrative (`scqa` · `scr`)

A narrative hierarchy. **SCQA:** `situation:` → `complication:` → `question:` → `answer:`. **SCR:** `situation:` → `complication:` → `resolution:` (no question level). Renders as a top-down card grid by default, or an OST-style tree with `view: tree`. Exactly one `situation:` (the root, no indent).

~~~
```vizardry
type: scqa
title: SCQA Narrative

situation: Conversion has been flat at 3% for two years
  complication: Competitor shipped one-click checkout
    question: How quickly can we match it?
      answer: Ship express checkout in Q3
    question: Do we build or buy the wallet layer?
      answer: Pilot a third-party wallet first
  complication: Cart abandonment is up 8% this quarter
    question: Where do users drop off?
      answer: Instrument the funnel before deciding
```
~~~

~~~
```vizardry
type: scr
title: SCR Narrative

situation: Checkout ran at 99.9% uptime all year
  complication: A config push took payments down for 40 minutes
    resolution: Add staged rollout with an automated config canary
```
~~~

Add `view: tree` (top level) to render as a branching diagram instead of the default card grid (`view: grid`).

---

## Image Carousel (`carousel`)

One Markdown image per line. Blank lines and `//` comments ignored. Minimum 2 images.

~~~
```vizardry
type: carousel
![Caption one](image-one.png)
![Caption two](image-two.png)
![Caption three](image-three.png)
```
~~~

---

## Concept Map (`conceptmap`)

A free-form **directed graph**; nodes are collected automatically from the edges (no node list). These lines are the exception to the "keywords end in a colon" rule.

~~~
```vizardry
type: conceptmap
title: Knowledge Domain

Photosynthesis -- requires --> Sunlight
Photosynthesis -- occurs in --> Plants
Photosynthesis -- produces --> Oxygen
Plants -- absorb --> Carbon Dioxide
Oxygen -- supports --> Life
```
~~~

| Line | Meaning |
| --- | --- |
| `A -- label --> B` | Directed edge A→B with a relationship label |
| `A --> B` | Directed edge with no label |

Self-loops are not allowed. Multiple edges between the same pair are valid.

---

## Node Map (`nodemap`)

A free-form boxes-and-arrows diagram with **manual coordinates**. Boxes are positioned in unbounded, non-negative units (the canvas grows to fit; there is no 0–1 axis). Max 50 boxes.

~~~
```vizardry
type: nodemap
title: Order Processing System

box: Customer [x: 40, y: 40, color: blue]
box: Order Service [x: 320, y: 40]
  Handles order creation
  and validation
box: Payment Gateway [x: 320, y: 220, color: green]

link: Customer -> Order Service : places order
link: Order Service -> Payment Gateway : charges card [color: green]
```
~~~

| Key | Meaning |
| --- | --- |
| `box: <Name> [x: <n>, y: <n>]` | A box at top-left corner (x,y ≥ 0). Name can't contain `:` or brackets |
| `box: <Name> [x: <n>, y: <n>, color: <c>]` | With a colour: palette name or `#hex` |
| (indented lines under `box:`) | Multi-line body text |
| `link: A -> B` | Directed arrow |
| `link: A <-> B` | Bidirectional |
| `link: A -- B` | Undirected (plain line) |
| `link: A -> B : label` | Add a label (note the spaces around `:`) |
| `link: A -> B [color: red, style: dashed]` | Modifiers: `color` (palette/`#hex`), `style` (`solid`/`dashed`) |

Palette colours: `red` `orange` `yellow` `green` `teal` `blue` `purple` `pink` `gray` (or any `#rgb`/`#rrggbb`). Link box names are case-insensitive; self-links are not allowed.

---

## Fishbone Diagram (`fishbone`)

Causes of a central effect, grouped into named categories.

~~~
```vizardry
type: fishbone
title: Fishbone Diagram

effect: High customer churn in month 1

category: Product
  cause: No in-app guidance
    subcause: Empty state gives no direction
  cause: Setup takes too long

category: Communication
  cause: Onboarding emails not relevant
  cause: No check-in from CS team

category: Expectation
  cause: Landing page overpromises speed
```
~~~

| Keyword | Depth | Meaning |
| --- | --- | --- |
| `effect:` | 0 | The problem (head of the fish) — required, one only |
| `category:` | 0 | A cause group (People, Process, Technology, …) |
| `cause:` | 1 (under category) | A contributing cause |
| `subcause:` | 2 (under cause) | A sub-level cause |

---

## Impact Map (`impact`)

Hierarchical tree: goal → actors → impacts → deliverables.

~~~
```vizardry
type: impact
title: Impact Map

goal: Increase 30-day retention by 15%

actor: Product Team
  impact: Reduce time-to-first-value
    deliverable: Onboarding wizard
    deliverable: Empty-state templates
  impact: Surface progress milestones
    deliverable: Progress bar in dashboard

actor: Marketing Team
  impact: Re-engage dormant users
    deliverable: Day-7 reactivation email sequence
```
~~~

| Keyword | Indent | Meaning |
| --- | --- | --- |
| `goal:` | 0 | Root — required, one only |
| `actor:` | 0 | Level 1 — repeatable |
| `impact:` | 1 | Level 2 — under an actor |
| `deliverable:` | 2 | Level 3 — under an impact |

---

## Mind Map (`mindmap`)

Horizontal tree radiating from one root. **Indent depth = tree level** (no keywords below the root).

~~~
```vizardry
type: mindmap
title: Mind Map

root: What makes a great PM?

  Discovery
    Talk to users weekly
    Root cause analysis
      5 Whys
    Distinguish problem from solution

  Delivery
    Short feedback loops
    Slice by outcome, not feature

  Strategy
    Align on the north-star metric
```
~~~

| Line | Meaning |
| --- | --- |
| `root: Text` | Central node — required, one only, no indent |
| Indented lines | Child nodes; indent depth = tree depth |

Use one consistent indent unit (2 or 4 spaces). This is one of the two frameworks where child lines have **no** keyword.

---

## Opportunity Solution Tree (`ost`)

A **keyword-per-level** tree rendered as labelled swim-lanes. Strict chain:
`outcome:` → opportunity → `solution:` → `experiment:`. The opportunity level accepts three interchangeable keywords — **`need:`**, **`pain:`**, **`desire:`** (same level, different caption). **Bare (keyword-less) indented lines become chevron bullets** on the node above them.

~~~
```vizardry
type: ost
title: Opportunity Solution Tree

outcome: 2x the rental listings in mid-west US areas

  need: I want to rent to tenants who pay on time
    solution: A platform to view renter info in one place
      Tenant credit checks
      Background checks
      experiment: Usability testing with landlords

  pain: I feel anxious about all the paperwork

  desire: I'd like tenant reviews from previous landlords
```
~~~

| Depth / keyword | Node |
| --- | --- |
| `outcome:` (depth 0) | Root — required, one only |
| `need:` / `pain:` / `desire:` (depth 1) | Opportunity |
| `solution:` (depth 2) | Solution |
| `experiment:` (depth 3) | Experiment |
| bare indented line | Bullet on the enclosing node |

---

## Pace Layer Analysis (`pacelayers`)

Six layers, three display variants: `pacelayers` (= `pacelayers, shearing`), `pacelayers, product`, `pacelayers, retro`. The **`layer:` key is always one of the six canonical names** — `Fashion` · `Commerce` · `Infrastructure` · `Governance` · `Culture` · `Nature` — **but** you can also write the active variant's display label as an alias (whatever the canvas actually shows).

~~~
```vizardry
type: pacelayers, shearing
title: Pace Layer Analysis
context: Our SaaS product — B2B collaboration tool

layer: Fashion
  note: Team sentiment shifting toward async-first

layer: Commerce
  obs: B2B purchasing cycle slowing
  feed: Enterprise deal size up 30%
  idea: Introduce a volume pricing tier

layer: Infrastructure
  obs: Database costs rising 15% QoQ
  feed: P99 latency improved after migration
  idea: Evaluate managed Postgres

layer: Governance
  obs: SOC 2 Type II audit in progress
  idea: Automate evidence collection

layer: Culture
  note: Remote-first policy under review

layer: Nature
  note: Network effects are structural
```
~~~

| Key | Meaning |
| --- | --- |
| `type: pacelayers, <variant>` | `shearing` (default) · `product` · `retro` |
| `context:` | Optional one-line header context |
| `layer: <name>` | One layer — canonical key or the variant's display label |
| `note:` | Free text (used for the Fashion/Nature rows) |
| `obs:` | Observation (what we see) |
| `feed:` | Feedback / signal |
| `idea:` | Action idea or hypothesis |

**Canonical key → display label per variant** (write either):

| Canonical | shearing | product | retro |
| --- | --- | --- | --- |
| `Fashion` | Trends | Experiments | Actions |
| `Commerce` | Markets | Features | Practices |
| `Infrastructure` | Systems | Architecture | Tooling |
| `Governance` | Governance | Operations | Agreements |
| `Culture` | Culture | Culture | Values |
| `Nature` | Nature | Mission | Purpose |

---

## RACI Matrix (`raci`)

~~~
```vizardry
type: raci
title: RACI Matrix

task: Define requirements
  responsible: Developer
  accountable: PM
  consulted: QA
  informed: Stakeholder

task: Build feature
  responsible: Developer
  accountable: PM
  consulted: QA
  informed: Stakeholder, Client
```
~~~

| Key | Meaning |
| --- | --- |
| `task: <name>` | A task row — repeatable |
| `responsible:` | Who does the work |
| `accountable:` | Who owns the outcome (one per task) |
| `consulted:` | Who is asked for input |
| `informed:` | Who is kept in the loop |

Multiple people per cell: comma-separated.

---

## Now/Next/Later Roadmap (`roadmap`)

~~~
```vizardry
type: roadmap
title: Now/Next/Later Roadmap

now:
  item: Ship login flow | CORE-1234
  item: Fix checkout bug

next:
  item: Onboarding redesign | CORE-5678
  item: Performance audit

later:
  item: Internationalisation
  item: Dark mode
```
~~~

| Key | Meaning |
| --- | --- |
| `now:` · `next:` · `later:` | Column headers — each required once |
| `item: <name>` | A roadmap item |
| `item: <name> \| <key>` | Item with a ticket key; rendered as a linked badge when Linear **or** Upvoty integration is active |

---

## SIPOC Diagram (`sipoc`)

One shared syntax, **two views over the same rows**: table (`sipoc` or `sipoc, table`, default) and flow (`sipoc, flow`). Switching `type:` never loses data — Owner/Metric just aren't drawn in flow view, and `link:` lines aren't drawn/validated in table view.

~~~
```vizardry
type: sipoc
title: SIPOC Diagram

row:
  supplier: Dev team
  input: Feature branch
  process: Build & test artefact
  output: Running service
  customer: End users

row:
  supplier: CI/CD pipeline
  input: Test suite
  process: Run test suite
  output: Deployment report
  customer: On-call team
```
~~~

| Key | Meaning |
| --- | --- |
| `row:` | Starts a new row — repeatable |
| `supplier:` `input:` `process:` `output:` `customer:` | The five core cells (indented under `row:`) |
| `owner:` | Optional, table-only; column hidden when unused |
| `metric:` | Optional, table-only; column hidden when unused |

All cell keys are optional per row; missing cells render as `—`. A duplicate key in one row is an error.

### Flow view (`sipoc, flow`)

Add `link:` lines to connect cell values. Each of the 5 core columns becomes one node per **distinct** value; nothing is connected automatically.

~~~
```vizardry
type: sipoc, flow
title: SIPOC Flow Diagram

row:
  supplier: Dev team
  input: Feature branch
  process: Build & test artefact
  output: Running service
  customer: End users

link: Dev team -> Feature branch
link: Feature branch -> Build & test artefact
link: Build & test artefact -> Running service
link: Running service -> End users
```
~~~

`link: A -> B` connects two cell values (case-insensitive). A link naming text that matches no cell — or the same text in two columns — errors, but only in flow view.

---

## Customer Journey Map / Service Blueprint (`journey` · `journey, blueprint`)

One shared syntax, two variants. `type: journey` shows five lanes; `type: journey, blueprint` adds three service-blueprint lanes below them. All eight lane keywords are always parsed, so switching variants never loses content.

~~~
```vizardry
type: journey
title: Customer Journey Map

persona: Returning online shopper
scenario: Reordering after a failed auto-renewal

phase: Awareness
  action: Receives renewal-failed email
  action: Opens app to check order status
  touchpoint: Email notification
  touchpoint: Mobile app
  feeling: Confused | Didn't expect the renewal to fail
  painpoint: Unclear why the renewal failed
  opportunity: Add a one-tap "retry payment" link in the email

phase: Consideration
  action: Opens order history
  touchpoint: Order history screen
  feeling: Mildly annoyed | Extra steps to fix something automatic
  painpoint: No clear CTA to fix the payment method
  opportunity: Surface "Update payment method" inline

phase: Resolution
  action: Updates card details
  touchpoint: Payment settings screen
  feeling: Relieved | Glad it was quick once found
  opportunity: Auto-suggest reorder after a successful update
```
~~~

Service Blueprint adds `frontstage:` / `backstage:` / `support:` lanes:

~~~
```vizardry
type: journey, blueprint
title: Subscription Recovery Blueprint

persona: Returning online shopper
scenario: Reordering after a failed auto-renewal

phase: Awareness
  action: Receives renewal-failed email
  touchpoint: Email notification
  feeling: Confused | Didn't expect the renewal to fail
  painpoint: Unclear why the renewal failed
  opportunity: Add a one-tap "retry payment" link
  frontstage: Support chatbot greets user in live chat
  backstage: Billing service logs the failed charge
  support: Payment gateway webhook retry queue
```
~~~

| Key | Lane | Variant |
| --- | --- | --- |
| `persona:` / `scenario:` | Header | both |
| `phase: <name>` | A column (unique names) | both |
| `action:` | Actions | both |
| `touchpoint:` | Touchpoints | both |
| `feeling:` | Thoughts & Feelings | both |
| `painpoint:` | Pain Points | both |
| `opportunity:` | Opportunities | both |
| `frontstage:` | Frontstage Actions | blueprint only |
| `backstage:` | Backstage Actions | blueprint only |
| `support:` | Support Processes | blueprint only |

Every lane line takes an optional ` | subtitle`: `feeling: Confused | Didn't expect it`. Repeat a keyword within a phase to add several cards to that lane.

---

## Venn Diagram (`venn`)

2- or 3-circle overlap. Items are `-`-prefixed bullets under a region.

~~~
```vizardry
type: venn
title: Venn Diagram

circle: Design
  - User research
  - Wireframing

circle: Engineering
  - Architecture
  - Code review

circle: Business
  - Market sizing

intersection: Design+Engineering
  - Prototyping
  - [[Design System|Shared components]]

intersection: Design+Business
  - Brand strategy

intersection: Engineering+Business
  - Build vs. buy

center:
  - Product vision
```
~~~

| Key | Meaning |
| --- | --- |
| `circle: <name>` | Defines a circle (2 or 3 total) |
| `- item` | Item in the parent region |
| `- [[Note\|Alias]]` | Clickable chip linking to a vault note |
| `intersection: A+B` | Overlap of two named circles (order-insensitive) |
| `center:` | 3-circle only — the triple intersection |

---

## Wardley Map (`wardley`)

Plots a value chain on two axes: **visibility** (Y, 0–1, top = user-visible) and **evolution** (X, 0–1, right = commodity). Coordinates are written `[visibility, evolution]`.

~~~
```vizardry
type: wardley
title: Wardley Map

stages: Genesis | Custom | Product | Commodity

anchor: User

component: User         [1.00, 0.10]
component: Web App      [0.85, 0.35]
component: Auth Service [0.60, 0.55]
component: Database     [0.40, 0.60]
component: Cloud Host   [0.15, 0.90]

link: User -> Web App
link: Web App -> Auth Service
link: Web App -> Database
link: Database -> Cloud Host

evolve: Auth Service 0.85

pipeline: Database [0.35, 0.75]
  Self-hosted [0.45]
  Managed DB  [0.70]
```
~~~

| Key | Meaning |
| --- | --- |
| `stages: A \| B \| C \| D` | Optional custom x-axis stage labels (min 2) |
| `stages:` + indented `0..1: Label` | Optional **positioned** x-axis labels — each position strictly between 0 and 1, strictly increasing |
| `anchor: <name>` | User-facing anchor node (rendered filled); auto-placed at `[1.0, 0.0]` unless a `component:` overrides it |
| `component: <name> [visibility, evolution]` | Places a node; both coords 0–1 |
| `link: A -> B` | Dependency arrow (endpoints case-insensitive; no self-links; duplicates ignored) |
| `evolve: <name> <evolution>` | Red movement arrow from the component to a future evolution (0–1), same visibility |
| `pipeline: <name> [x1, x2]` + indented `<Sub> [evolution]` | Draws the component as a box spanning `x1…x2` with sub-components; each sub-component's evolution must be within `[x1, x2]` |

Wardley is the one framework where **inline trailing `// comments`** are also stripped. Axes: Y = Visibility (1 = top, direct user need), X = Evolution (0 = Genesis → 1 = Commodity).

Positioned stages example:

~~~
```vizardry
type: wardley
stages:
  0.10: Genesis
  0.40: Custom
  0.70: Product

anchor: User
component: User [1.0, 0.1]
```
~~~

---

## Wheel of Life (`wheeloflife`)

A segmented dartboard for the coaching Wheel of Life: each area is an equal wedge filled from the centre out to its **0–10** score. Between 2 and 12 areas, drawn in source order. Read-only (scores live in the source).

~~~
```vizardry
type: wheeloflife
title: Wheel of Life

area: Career | 7 | Growing, but stretched thin
area: Finances | 5
area: Health | 4 | Need to move more
area: Family | 8
area: Relationships | 7
area: Personal Growth | 6
area: Fun & Recreation | 3
area: Environment | 6
```
~~~

| Key | Meaning |
| --- | --- |
| `area: <Name> \| <score>` | A life area and its 0–10 score (the wedge fill level) |
| `area: <Name> \| <score> \| <note>` | Same, plus a short note shown on hover |

Scores are numbers 0–10 (decimals allowed); out-of-range values are clamped. Recoverable issues — a missing/non-numeric score, a duplicate area, a line that isn't an `area:` — skip that line and show a warning chip instead of failing the canvas. Area names are case-insensitive for duplicate detection.

---

## Odyssey of Life (`odyssey`)

The Odyssey Plan from *Designing Your Life*: **2–4** parallel multi-year life plans laid side by side. Each plan has a headline, a vertical timeline of year milestones, a dashboard of **0–10** gauges, and open questions. Read-only (the plan lives in the source).

~~~
```vizardry
type: odyssey
title: Three Roads Forward

plan: A | The Steady Climb
  archetype: Current path, leveled up
  year 1: Ship the platform rewrite
  year 3: Move into product strategy
  year 5: Head of Product
  gauge: Resources | 8
  gauge: Likability | 6
  gauge: Confidence | 8
  gauge: Coherence | 6
  question: Do I actually want to manage people?

plan: B | Indie Maker
  archetype: The pivot
  year 1: Launch a paid side project
  year 5: Sustainable one-person business
  gauge: Resources | 4
  gauge: Confidence | 4
  question: How long can I fund the runway?
```
~~~

| Key | Meaning |
| --- | --- |
| `plan: <Label> \| <Title>` | Opens a plan. `<Label>` (e.g. `A`) is optional — omit it (`plan: The Steady Climb`) and it auto-letters A/B/C/D by position |
| `archetype: <text>` | Optional one-line descriptor under the title |
| `year <N>: <text>` | A milestone at year N; the timeline sorts ascending by year |
| `gauge: <Name> \| <value>` | A 0–10 dashboard gauge (fuel-gauge dial); names are free-form |
| `question: <text>` | An open question the plan raises |

The `archetype`/`year`/`gauge`/`question` lines attach to the most recent `plan:` — indentation is cosmetic. Out-of-range gauge values are clamped to 0–10. Recoverable issues (a keyword before any `plan:`, a missing gauge value, a duplicate year, an unparsable line) skip that line with a warning chip; it's only fatal with fewer than two plans.

---

## Circle of Influence & Concern (`circleofinfluence`)

Covey's Habit 1 proactivity model as concentric rings: **Concern** (outer — things you can't act on), **Influence** (middle — things you can affect), **Control** (inner — your own actions). One item per line. The `control:` tier is optional (omit it for the classic two-ring diagram).

~~~
```vizardry
type: circleofinfluence
title: What's on my mind

concern: The economy
concern: What competitors do
influence: My team's morale
influence: Key customer relationships
control: My daily priorities
control: How I respond to setbacks
```
~~~

| Key | Meaning |
| --- | --- |
| `concern: <text>` | Outer ring — you care but can't act on it |
| `influence: <text>` | Middle ring — you can affect it |
| `control: <text>` | Inner ring — entirely within your own doing |

At least 2 items total; each ring holds up to 8. An empty item or an unrecognised keyword skips that line with a warning chip instead of failing the canvas.

---

## Whole Person / Four Dimensions (`wholeperson`)

Covey's Whole-Person Paradigm / "Sharpen the Saw": four fixed dimensions — **Body** (physical), **Mind** (mental), **Heart** (social/emotional), **Spirit** (spiritual) — each scored **0–10** on a wheel with optional renewal activities. Any dimension omitted renders at 0.

~~~
```vizardry
type: wholeperson
title: Sharpen the Saw

body: 6 | Run 3× a week | Sleep 7 hours
mind: 7 | Read 20 min daily
heart: 5 | Weekly date night | Call a friend
spirit: 4 | Morning meditation
```
~~~

| Key | Meaning |
| --- | --- |
| `body: <0–10> \| <activity> \| …` | Physical dimension: score, then optional activities |
| `mind: <0–10> \| <activity> \| …` | Mental dimension |
| `heart: <0–10> \| <activity> \| …` | Social / emotional dimension |
| `spirit: <0–10> \| <activity> \| …` | Spiritual dimension |

At least one dimension is required; out-of-range scores are clamped to 0–10, up to five activities each. A missing/non-numeric score, a duplicate dimension, or an unrecognised keyword skips that line with a warning chip.

---

## Links (headings & tickets)

Any element label (grid block, matrix item, etc.) can carry a link. A link icon appears on the element.

1. **Wiki heading link** — `[[#Heading]]`:

~~~
```vizardry
type: lean
block: Problem [[#Problem Discovery]]
  Too many manual steps
```
~~~

2. **Markdown heading link** — `[label](#Anchor%20Text)` (spaces → `%20`):

~~~
```vizardry
type: kata
block: Next Experiment [Next Experiment](#Next%20Experiment)
  Ship a 5-step guided wizard
```
~~~

3. **Ticket link** — `[label](TICKET-KEY)` links to Linear or Upvoty when that integration is configured, e.g. `[Fix login](CORE-1234)`.

4. **Auto-detection** — if a note heading exactly matches an element label (case-insensitive), the link icon appears automatically with no extra syntax.

For **matrix items**, place the annotation *before* the position token:
`item: Fix login [Fix login](CORE-1234) at: t1`.

---

## Canvas controls (every canvas)

Icon buttons in the title bar, revealed on hover:

| Button | Action |
| --- | --- |
| Font size −/+ | Adjust this canvas's text size |
| Edit source | Open the code block for direct text editing |
| Download | Export a high-DPI PNG. On **desktop** it downloads the file; on **mobile** it opens the system share sheet (Save to Photos/Files) |
| Copy source | Copy this canvas's ` ```vizardry ` fence to the clipboard |
| Present | Full-screen presentation overlay |
| Minimize / Expand | Collapse to the title bar; persisted as `collapsed: true` in the source |

---

## Quick generation checklist (for LLMs)

Before returning a canvas, verify:

- [ ] Fenced with ` ```vizardry ` … ` ``` `.
- [ ] Has a `type:` line with a valid id from the index (and a valid variant if used).
- [ ] Grid block labels exactly match the framework's list.
- [ ] Indentation is consistent (2 spaces) and uses spaces, not tabs.
- [ ] No inline `//` comments except in `wardley`/`pacelayers`; comments are on their own line.
- [ ] Matrix: axes present (or a preset supplies them); `tN` ids within `t1…t(cols·rows)`; item labels unique; `[x,y]` uses 0–1 with origin bottom-left.
- [ ] Wardley: coordinates are `[visibility, evolution]`, both 0–1; every `link:`/`evolve:`/`pipeline:` names a declared `component:`.
- [ ] No quotes around values; no trailing commentary outside the fence.
