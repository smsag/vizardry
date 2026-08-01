# Vizardry

An [Obsidian](https://obsidian.md) plugin that renders product management frameworks as visual canvases inline in your notes — using fenced code blocks as input. Supports grid-based canvases, trees, diagrams, and flow charts.

Canvases are **editable in Live Preview**: click any grid block to edit its content; for Wardley Maps drag components to reposition them, draw new components, and double-click to rename; for User Story Maps add task cards, drag them between slice bands and across step columns, and double-click any element to rename it. No need to touch the source block directly.

---

## How it works

Write a ` ```vizardry ` fenced code block with a `type:` line naming the framework, e.g. `type: bmc`. Switch to **Live Preview** or **Reading View** to see the rendered canvas.

**Grid canvases** use `block: Label` to define each section, with content indented below:

```
block: Label
  Content line 1
  Content line 2
```

**In Live Preview**, click any block body to edit it inline. Changes are written back to the source file automatically when you click away (or press Escape to discard).

---

## Supported frameworks

Every canvas uses the same ` ```vizardry ` fence — the `type:` line inside picks the framework. A few frameworks have their own further variant, given as a second, comma-separated value (`type: matrix, pain`).

| `type:` value | Framework | Kind |
|---|---|---|
| `adkar` | ADKAR Model | Grid |
| `bmc` | Business Model Canvas | Grid |
| `fourls` | 4Ls Retrospective | Grid |
| `carousel` | Image Carousel | Gallery |
| `experiment` | Experiment Canvas | Grid |
| `impact` | Impact Map | Tree |
| `journey` | Customer Journey Map | Grid |
| `journey, blueprint` (or insert as `service-blueprint`) | Service Blueprint | Grid |
| `jobs` | Jobs Canvas | Grid |
| `kata` | Product Kata | Grid |
| `lean` | Lean Canvas | Grid |
| `leanux` | Lean UX Canvas | Grid |
| `matrix` or `matrix, pain` | Pain Point Matrix | Grid |
| `matrix, opportunity` | Opportunity Matrix | Grid |
| `matrix, impact` | Impact / Effort Matrix | Grid |
| `mindmap` | Mind Map | Tree |
| `nodemap` | Node Map | Graph |
| `opportunity` | Opportunity Canvas | Grid |
| `ost` | Opportunity Solution Tree | Tree |
| `pacelayers` or `pacelayers, shearing` | Pace Layer Analysis | Grid |
| `pacelayers, product` | Pace Layer Analysis (product variant) | Grid |
| `pacelayers, retro` | Pace Layer Analysis (retro variant) | Grid |
| `rac` | Riskiest Assumptions Canvas | Grid |
| `raci` | RACI Matrix | Table |
| `scqa` | SCQA Narrative | Grid / Tree |
| `scr` | SCR Narrative | Grid / Tree |
| `sipoc` or `sipoc, table` | SIPOC Diagram | Table |
| `sipoc, flow` | SIPOC Diagram (flow view) | SVG flow |
| `story` | User Story Map | Grid |
| `swot` | SWOT Analysis | Grid |
| `vpc` | Value Proposition Canvas | Grid |
| `venn` | Venn Diagram | SVG overlap |
| `wardley` | Wardley Map | SVG canvas |
| `ptw` | Playing to Win | Grid |
| `conceptmap` | Concept Map | SVG graph |

---

## Inserting a canvas

Three ways to insert a fully structured empty template at your cursor:

**Command palette** — `Cmd+P` (macOS) / `Ctrl+P` (Windows/Linux) → search **Insert canvas** → pick a framework from the fuzzy list.

**Per-framework commands** — search the framework name directly in `Cmd+P` (e.g. "Insert Business Model Canvas"). Each framework has its own command, bindable to a keyboard shortcut in Settings → Hotkeys.

**Ribbon icon** — tap the template icon in the left sidebar to open the same fuzzy picker.

On **mobile**, add any Vizardry command to the editor toolbar via Settings → Mobile → Edit toolbar for one-tap access above the keyboard.

---

## Inline block editing

In **Live Preview**, every grid canvas block is editable:

- **Click** the block body to open an inline textarea
- **Type** to add or change content
- **Click away (blur)** to save — the change is written to the source file immediately
- **Escape** to discard the edit and restore the original content
- **Tab** inserts two spaces inside the textarea

In Reading View the canvas is rendered normally with no edit affordance.

---

## Examples

### Business Model Canvas

~~~
```vizardry
type: bmc
block: Key Partners
  Suppliers, Logistics partners

block: Key Activities
  Product development, Marketing

block: Key Resources
  Team, Brand, Platform

block: Value Propositions
  Save time and reduce cost for small teams

block: Customer Relationships
  Self-service, Email support

block: Channels
  App store, Website, Word of mouth

block: Customer Segments
  Small business owners, Solo founders

block: Cost Structure
  Engineering salaries, Cloud hosting, Ads

block: Revenue Streams
  Monthly subscriptions, One-time licenses
```
~~~

---

### ADKAR Model

~~~
```vizardry
type: adkar
block: Awareness
  Teams understand why the reporting workflow must change now
  Leadership aligns on the cost of staying with manual exports

block: Desire
  Ops leads want the new workflow because it removes Friday rushes
  Managers support rollout goals and reinforce adoption expectations

block: Knowledge
  Team knows the new reporting flow and where each metric lives
  Owners know how to configure recurring exports and templates

block: Ability
  First two weekly reporting cycles run without manual spreadsheet work
  Team can troubleshoot common import and mapping issues independently

block: Reinforcement
  Weekly review checks adoption and quality outcomes
  Legacy spreadsheet path is retired after stable usage for one month
```
~~~

---

### 4Ls Retrospective

~~~
```vizardry
type: fourls
block: Liked
  Fast deployment pipeline
  Smooth cross-team collaboration
  Clear sprint goal throughout

block: Learned
  Load testing should happen earlier
  Async standups reduce context switching
  Smaller PRs get reviewed faster

block: Lacked
  Clearer ownership for the API layer
  Earlier design involvement in spec phase
  Better documentation for onboarding

block: Longed For
  Dedicated time for tech debt each sprint
  Shared retro board visible during the sprint
  More pairing sessions

block: Actions
  - [ ] Schedule regular pairing slots -- owner: Alex
  - [ ] Add tech debt items to each sprint -- owner: Team
  - [ ] Involve design from ticket creation -- owner: Sam
```
~~~

---

### Image Carousel

~~~
```vizardry
type: carousel
![](image-one.png)
![](image-two.png)
![](image-three.png)
```
~~~

**Rules:**
- One image per line using standard Markdown image syntax
- Blank lines and `//` comment lines are ignored
- Fewer than 2 images shows a visible error message

**Controls:** left/right arrow buttons, dot indicators, keyboard `←`/`→`, swipe on mobile. A **fullscreen** button (expand icon) in the title bar opens the current image full-screen with its caption — dismiss with ✕, Escape, or swipe.

---

### Impact Map

~~~
```vizardry
type: impact
goal: Increase 30-day retention by 15%

actor: Product Team
  impact: Reduce time-to-first-value
    deliverable: Onboarding wizard
    deliverable: Empty state templates
  impact: Surface progress milestones
    deliverable: Progress bar in dashboard
    deliverable: Celebration moment at day 7

actor: Marketing Team
  impact: Re-engage dormant users
    deliverable: Day-7 reactivation email sequence
  impact: Set clearer expectations pre-signup
    deliverable: Revised landing page copy
    deliverable: Updated onboarding video

actor: Customer Success
  impact: Catch at-risk accounts early
    deliverable: Health score dashboard
    deliverable: Automated check-in workflow
```
~~~

**Layout:** Renders as a horizontal tree — goal on the right, actors and impacts flowing to the left.

**Syntax:**
- `goal:` — root, no indent, required, one only
- `actor:` — no indent, repeatable
- `impact:` — indented once under an actor
- `deliverable:` — indented twice under an impact

---

### Jobs Canvas

~~~
```vizardry
type: jobs
block: Job Performer
  Operations manager at a 50-person B2B SaaS company

block: Main Job
  Produce accurate weekly reports for leadership without stress

block: Circumstances
  End of week, under time pressure, data spread across three tools

block: Functional Aspects
  Pull data from three sources, calculate KPIs, format slides,
  distribute to leadership by Friday at noon

block: Emotional Aspects
  Wants to feel in control and look competent in front of the CEO
  Fears sending a report with a mistake

block: Social Aspects
  Known as the person who "always has the numbers ready"
  Seen as a reliable, detail-oriented operator

block: Current Solutions
  Excel + manual copy-paste from dashboards + PowerPoint formatting
  Slack reminders to chase down missing data from other teams

block: Desired Outcomes
  Done in under 30 minutes with no manual errors
  Report looks polished without extra design work
  No chasing people for data on Friday morning

block: Obstacles
  Data lives in three tools with no shared export format
  KPI definitions are inconsistent across departments
```
~~~

---

### Lean Canvas

~~~
```vizardry
type: lean
block: Problem
  Too many manual steps in the daily reporting workflow

block: Solution
  One-click automation for recurring tasks

block: Unique Value Proposition
  10× faster than the current status quo

block: Unfair Advantage
  Proprietary dataset and 3-year head start

block: Customer Segments
  Freelancers and solo founders

block: Key Metrics
  DAU, activation rate, monthly churn

block: Channels
  Product Hunt, SEO, Word of mouth

block: Cost Structure
  Engineering salaries, Cloud hosting

block: Revenue Streams
  Monthly SaaS subscription
```
~~~

---

### Lean UX Canvas

~~~
```vizardry
type: leanux
block: Business Problem
  Users drop off during onboarding before reaching their first value moment

block: Business Outcomes
  Increase 7-day retention by 20%

block: Users
  First-time SaaS buyers with no technical background

block: User Outcomes & Benefits
  Feel confident and productive within 10 minutes of signing up

block: Solutions
  Guided setup wizard, contextual tooltips, pre-loaded sample data

block: Hypotheses
  If we add a guided wizard, users will reach first value faster
  If we show sample data, users will understand the product sooner
  If we reduce setup steps, fewer users will abandon mid-flow

block: Most Important Thing to Learn First
  Do users abandon because setup feels overwhelming, or because
  they don't understand the value of completing it?

block: Minimum Experiment
  A/B test: guided wizard vs blank start with 500 new signups
```
~~~

---

### Mind Map

~~~
```vizardry
type: mindmap
root: What makes a great PM?

  Discovery
    Talk to users weekly
    Root Cause Analysis
      5 Whys
      Opportunity Canvas
    Distinguish problem from solution

  Delivery
    Short feedback loops
    Slice by outcome, not feature
    Story Map before planning

  Strategy
    Understand trade-offs
    Align on north-star metric
    Kill features that don't serve the goal

  Mindset
    Comfort with ambiguity
    Curiosity over certainty
    Ship to learn
```
~~~

**Layout:** Renders as a horizontal tree — root on the left, branches growing to the right.

**Syntax:**
- `root:` — central node, no indent, required, one only
- Indented lines — child nodes; indent level determines depth
- Any consistent indent unit works (2 spaces, 4 spaces, tab)
- Blank lines and `// comment` lines are ignored

---

### Opportunity Canvas

~~~
```vizardry
type: opportunity
block: Problem / Opportunity
  Manual reporting consumes 4+ hours per week for ops teams

block: Solution Ideas
  Automated report generation, smart templates, one-click export

block: Target Users
  Operations managers and analysts at 20–200 person companies

block: User Outcomes
  Reclaim time, reduce errors, look credible to leadership

block: User Metrics
  Hours saved per week, error rate, report turnaround time

block: Business Problem
  High churn from power users citing workflow friction

block: Business Metrics
  30-day churn rate, feature adoption, support ticket volume

block: Budget
  2 engineers, 1 designer, 1 quarter

block: Adoption Factors
  In-app prompt after third manual export, onboarding flow

block: Factors for Success
  Low setup friction, works with tools users already have
```
~~~

---

### Opportunity Solution Tree

Renders as labelled horizontal swim-lanes — Outcome, Opportunity, Solution,
Experimentation — with a distinct colour per lane, outlined boxes that wrap their
text, and per-node captions.

~~~
```vizardry
type: ost
outcome: Increase weekly active users by 20% in Q3.

  need: New users do not discover the first high-value workflow.
    solution: Guided quick-start path for first session.
      Highlight the primary action on first load
      Skippable, resumable steps
      experiment: A/B test quick-start entry point on onboarding screen.

  pain: Returning users struggle to continue unfinished work.
    solution: Resume banner for incomplete workflows.

  desire: Users want to see progress at a glance.
```
~~~

**Syntax:**
- The strict chain is `outcome → opportunity → solution → experiment`
- `outcome:` — root node, no indent, required, one only
- The Opportunity lane accepts three keywords — `need:`, `pain:`, `desire:` — all
  at the same level; they differ only in the italic caption shown (*Customer
  need* / *Customer pain point* / *Customer desire*)
- `solution:` / `experiment:` — indented one level under their required parent;
  several siblings are allowed at every level
- A **bare (keyword-less) indented line** becomes a chevron bullet on the node
  above it — any node may carry bullets (e.g. the solution features above)
- Blank lines and `// comment` lines are ignored

> **Breaking change (from the pre–swim-lane OST):** the `opportunity:` and
> `assumption:` keywords, and the legacy bare-indent form, were removed. Rename
> `opportunity:` lines to `need:`/`pain:`/`desire:`; former `assumption:` detail
> is best expressed as bullets under a solution. A leftover `opportunity:` line
> now renders as a bullet rather than a node.

---

### SCQA / SCR Narrative

A narrative hierarchy: one `situation:` branches into complications, each into
questions, each holding one or more answers. It renders as a top-down grid of cards
by default and can morph into a **swim-lane tree** with `view: tree` — labelled
bands (Situation / Complication / Question / Answer), one theme-aware colour per
lane, and outlined boxes that wrap their text, sharing the Opportunity Solution
Tree's visual language.

~~~
```vizardry
type: scqa
title: Why we're repricing

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

The **SCR** variant drops the question level — `situation → complication →
resolution` — via `type: scr` instead of `type: scqa`:

~~~
```vizardry
type: scr
situation: Checkout ran at 99.9% uptime all year
  complication: A config push took payments down for 40 minutes
    resolution: Add staged rollout with an automated config canary
```
~~~

**Syntax:**
- Each node names its level; the strict chain is `situation → complication → question → answer` (SCQA) or `situation → complication → resolution` (SCR)
- `situation:` — root node, no indent, required, one only
- `complication:` / `question:` / `answer:` (or `resolution:`) — indented one level under their required parent; several siblings are allowed at every level
- `view: grid` (default) or `view: tree` — chooses the card grid or the swim-lane tree
- A **bare (keyword-less) indented line** under a node becomes a chevron bullet on it (any node may carry bullets) — in the tree view
- Blank lines and `// comment` lines are ignored
- In edit mode both views support inline rename, add (`+`), and delete (`×`); the tree view also lets you add/edit/remove bullets inline, and the grid allows drag to reorder siblings
- Legacy bare-indent narratives (root keyword only, children by indentation) still render

---

### Product Kata

~~~
```vizardry
type: kata
block: Current Condition
  Onboarding takes 3 days on average and requires manual
  handholding from the Customer Success team on every account

block: Target Condition
  New users reach their first value moment within 30 minutes,
  unassisted, with no CS intervention needed

block: Obstacles
  No in-app guidance exists today
  Sample data is not representative of real use cases
  Setup requires 12 manual configuration steps before any value

block: Next Experiment
  Ship a 5-step guided wizard focused on the single top
  job-to-be-done identified in the last 10 user interviews

block: Expected Outcome
  40% of new signups complete setup without contacting support
  within the first 14 days of the experiment
```
~~~

---

### Riskiest Assumptions Canvas

~~~
```vizardry
type: rac
block: Customers
  Ops managers at 20–200 person SaaS companies — P:4 I:9 Risk:36
  Finance teams needing weekly KPI reports — P:3 I:7 Risk:21

block: Problem
  Manual reporting consumes 4+ hours per week — P:3 I:9 Risk:27
  Data inconsistency causes rework and embarrassment — P:2 I:8 Risk:16

block: Solution
  One-click automation solves the core pain — P:3 I:8 Risk:24
  Users will self-serve without CS support — P:4 I:7 Risk:28

block: MVP
  Export automation alone is enough to validate — P:4 I:8 Risk:32
  Customers will pay before full feature parity — P:3 I:10 Risk:30

block: Competition
  No direct competitor owns the SMB reporting niche — P:3 I:7 Risk:21
  Incumbents are too slow to copy the approach — P:2 I:6 Risk:12

block: Sales Channels
  Product-led growth will drive most acquisition — P:4 I:8 Risk:32
  Inbound SEO alone supports target growth rate — P:3 I:7 Risk:21

block: Top Riskiest Assumptions
  1. Ops managers are the right buyer (Risk: 36)
  2. PLG drives sufficient acquisition (Risk: 32)
  3. Export MVP validates core value (Risk: 32)
  4. Customers pay before full parity (Risk: 30)
  5. One-click automation solves the pain (Risk: 27)
```
~~~

Each assumption is rated: **P** = probability of being wrong (1–5), **I** = impact if wrong (1–10). Risk = P × I.

---

### Experiment Canvas

~~~
```vizardry
type: experiment
block: Hypothesis
  Ops managers will pay for one-click weekly report automation.

block: Test
  Run a landing page with a "Notify me" signup form, driven by 200 cold outreach emails to ops managers at SaaS companies.

block: Metric
  Signup conversion rate from outreach email to landing page form submission.

block: Success Criteria
  We are right if at least 8% of contacted ops managers sign up within two weeks.

block: Observation
  14 of 200 contacted ops managers signed up (7%) within two weeks.

block: Learning
  Interest is close to the threshold but concentrated among larger teams (50+ people) — smaller teams didn't respond.

block: Decision
  Persevere, but narrow the test to ops managers at 50–200 person companies and re-run with a sharper pitch.
```
~~~

A test card (Hypothesis, Test, Metric, Success Criteria) paired with a learning card (Observation, Learning, Decision) — Strategyzer's approach to running one experiment at a time and turning it into a documented decision.

---

### SIPOC Diagram

A SIPOC maps the full scope of a process row by row — each row traces one chain from supplier to customer, making attribution immediately readable. It's one canvas with two views over the same rows: a **table** (default) and a **flow** diagram — switch between them just by changing the `type:` line, and nothing you've entered is ever lost in either direction.

~~~
```vizardry
type: sipoc
row:
  supplier: Dev team
  input: Feature branch
  process: Build & test artefact
  output: Running service
  customer: End users
  owner: Jane
  metric: Cycle time

row:
  supplier: CI/CD pipeline
  input: Test suite
  process: Run test suite
  output: Deployment report
  customer: On-call team

row:
  supplier: Cloud provider
  input: Docker image
  process: Deploy to production
  output: Alert rules
  customer: Product owner
```
~~~

**Syntax:**
- `row:` — starts a new row at zero indent, repeatable
- Indented `supplier:`, `input:`, `process:`, `output:`, `customer:` — the five core cell keys; all are optional per row
- Indented `owner:`, `metric:` — two optional extended columns; both columns are hidden in table view when no row uses them, and are never shown in flow view (see below) — they're preserved either way
- Missing cells render as `—`
- Blank lines and `// comment` lines are ignored

**Live Edit:** click any cell to edit it inline. The Process column is visually accented with your theme's accent colour. Hover any row to reveal a **+** button at the right edge — click it to insert a new empty row below.

**Flow view:** switch `type: sipoc` to `type: sipoc, flow` to see the same rows as a connected diagram instead of a table. Each of the 5 core columns turns into one node per **distinct** cell value (two rows with the same Supplier text share one node); nothing is connected automatically — add `link: A -> B` lines yourself for the connections you want to show. Owner/Metric never appear in flow view, but stay in the source and reappear the moment you switch back to `type: sipoc`. Flow view is read-only in this pass — edit rows and links as text, then switch views to see the result.

~~~
```vizardry
type: sipoc, flow
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

- `link: A -> B` — directed arrow between two cell values; links can go in any direction including backwards, and same-column links route vertically
- A `link:` naming text that doesn't match any cell (or matches the same text in more than one column) shows a clear error, but **only in flow view** — table view is unaffected by a stale or ambiguous link
- Node names are case-insensitive in link declarations

**Migrating from the old `type: sipoc-flow`:** that flat fence id (freeform node declarations with `[shape]`, unrelated to rows) has been replaced by the `type: sipoc, flow` view above. There's no automatic migration — rewrite the diagram as `row:` blocks plus `link:` lines; a leftover `type: sipoc-flow` block will show an "unknown type" error.

---

### SWOT Analysis

~~~
```vizardry
type: swot
block: Strengths
  Strong brand recognition
  Experienced engineering team
  Loyal early-adopter base

block: Weaknesses
  Limited marketing budget
  Single-channel distribution
  No enterprise sales motion yet

block: Opportunities
  Growing demand for async collaboration tools
  Potential partnership with major LMS providers
  Untapped international markets

block: Threats
  Well-funded competitors entering the space
  Possible API pricing changes from key dependency
  Economic downturn reducing SMB software spend
```
~~~

---

### User Story Map

~~~
```vizardry
type: story
user: Team Lead
goal: Coordinate team and ship features reliably

activity: Define
  step: Backlog
    task: Create ticket | title and acceptance criteria
    task: Estimate | story points via planning poker
    task: Assign | pick owner from team roster
  step: Sprint Planning
    task: Build sprint | drag tickets from backlog
    task: Set goal | one-line sprint objective

activity: Build
  step: Development
    task: Start work | move ticket to in-progress
    task: Open PR | linked to ticket with description
    task: Request review | tag a reviewer
  step: Review
    task: Read diff | leave inline comments
    task: Approve | or request changes with notes
    task: Merge | squash and merge to main

activity: Ship
  step: QA
    task: Smoke test | cover critical user paths
    task: Regression | run automated test suite
  step: Release
    task: Tag version | apply semver tag
    task: Deploy | one-click promote to production
    task: Announce | post changelog to stakeholders

activity: Improve
  step: Retrospective
    task: Collect feedback | team happiness score
    task: Action items | owner and due date
  step: Analytics
    task: Velocity chart | story points per sprint
    task: Burndown | remaining work over time

slice: MVP
  step: Backlog | Create ticket, Assign
  step: Development | Start work, Open PR, Request review
  step: Review | Read diff, Approve, Merge
  step: Release | Deploy

slice: V1.1
  step: Backlog | Estimate
  step: Sprint Planning | Build sprint, Set goal
  step: QA | Smoke test, Regression
  step: Release | Tag version, Announce
```
~~~

**Syntax:**
- `user:` / `goal:` — optional header metadata
- `activity: <name>` — top-level backbone group spanning its step columns
- `step: <name>` — one grid column; must be unique across all activities
- `task: <name>` or `task: <name> | <subtitle>` — task card; optional subtitle after `|`
- `slice: <name>` — priority band; `step: <name> | task A, task B` assigns tasks
- Unassigned tasks collected into a **Backlog** band at the bottom

**Visual editing in Live Preview:**

| Action | Gesture |
|---|---|
| **Add a task** | In edit mode, `+` button appears on hover in each step's Backlog cell |
| **Reorder within a slice** | Drag a task card up or down within the same slice band |
| **Move to another slice** | Drag a task card to a different slice band in the same column |
| **Move to another column** | Drag a task card to any cell in a different step column — task declaration and slice references update automatically |
| **Rename user / goal** | Click the badge in the canvas header |
| **Rename activity** | Double-click an activity header |
| **Rename step** | Double-click a step header — all slice cell references cascade |
| **Rename task** | Double-click a task card name — all slice key references cascade |
| **Cancel a drag** | Release outside the story map grid — card snaps back, no change |

---

### Customer Journey Map / Service Blueprint

~~~
```vizardry
type: journey
persona: Returning online shopper
scenario: Reordering a subscription item after a failed auto-renewal

phase: Awareness
  action: Receives renewal-failed email
  touchpoint: Email notification
  feeling: Confused | Didn't expect the renewal to fail
  painpoint: Unclear why the renewal failed
  opportunity: Add a one-tap "retry payment" link in the email

phase: Consideration
  action: Opens order history
  touchpoint: Order history screen
  feeling: Mildly annoyed | Extra steps to fix something automatic
  opportunity: Surface "Update payment method" inline on order history
```
~~~

One canvas, two views over the same phase/lane data — a **journey map** (default) and a **service blueprint**. Switch between them just by changing the `type:` line (`type: journey` ↔ `type: journey, blueprint`), the same way SIPOC's table and flow views switch; nothing you've entered is ever lost in either direction, since `frontstage:`/`backstage:`/`support:` lines are always parsed, just not rendered under `type: journey`.

**Syntax:**
- `persona:` / `scenario:` — optional header metadata
- `phase: <name>` — one grid column; must be unique
- `action:`, `touchpoint:`, `feeling:`, `painpoint:`, `opportunity:` — journey lanes, each rendered as a row of cards under every phase
- `frontstage:`, `backstage:`, `support:` — Service Blueprint-only lanes (Frontstage Actions, Backstage Actions, Support Processes), separated by "Line of Interaction" / "Line of Visibility" / "Line of Internal Interaction" dividers
- Any lane keyword supports `<keyword>: <name> | <subtitle>` for an optional subtitle
- Multiple lines with the same keyword under one phase stack as multiple cards, in source order
- Blueprint-only lane lines are always parsed even under `type: journey` — they simply aren't rendered until you switch the `type:` line to `journey, blueprint`, so nothing is lost switching views by hand

**Visual editing in Live Preview:**

| Action | Gesture |
|---|---|
| **Add a card** | In edit mode, `+` button appears on hover in every cell |
| **Reorder within a lane** | Drag a card up or down within the same lane row |
| **Move to another phase** | Drag a card to the same lane in a different phase column |
| **Rename persona / scenario** | Click the badge in the canvas header |
| **Rename phase** | Double-click a phase header |
| **Rename card** | Double-click a card's name |
| **Cancel a drag** | Release outside the grid — card snaps back, no change |

---

### Value Proposition Canvas

~~~
```vizardry
type: vpc
block: Products & Services
  Automated reporting suite
  One-click export to PDF and Slides
  Scheduled delivery to stakeholders

block: Pain Relievers
  Eliminates manual data gathering and copy-paste formatting
  Removes dependency on the analyst for routine reports

block: Gain Creators
  Polished, on-brand reports ready in seconds instead of hours
  More time for analysis and strategic thinking

block: Customer Jobs
  Produce accurate weekly status reports for senior leadership
  Present data confidently without needing design support

block: Pains
  Repetitive, error-prone work that eats Friday afternoons
  Reports look inconsistent across team members

block: Gains
  Look credible and prepared in front of the CEO
  Free up time for higher-value work
```
~~~

---

### Venn Diagram

~~~
```vizardry
type: venn
circle: Design
  - User research
  - Wireframing

circle: Engineering
  - Architecture
  - Code review

circle: Business
  - Market sizing
  - Revenue model

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

**Syntax:**
- `circle: <name>` — defines a circle (2 or 3 total)
- `- item text` — indented bullet placed in the parent region
- `- [[Note|Alias]]` — clickable chip linking to a note; alias is the display text
- `intersection: A+B` — items in the overlap of named circles (order-insensitive)
- `center:` — 3-circle only; shorthand for the triple intersection

---

### Wardley Map

A Wardley Map plots the components of a value chain on two axes: **visibility** (how visible to the user, top = visible) and **evolution** (how commoditised, right = commodity). It reveals which components to build, buy, or outsource.

~~~
```vizardry
type: wardley
stages: Driver | Approver | Contributor | Informed

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
```
~~~

**Syntax:**
- `stages: Label A | Label B | ...` — optional custom x-axis labels (at least two labels)
- `stages:` with indented `0..1: Label` entries — optional positioned x-axis labels (strictly increasing; each position must be strictly between 0 and 1; positions define interval boundaries and labels are centered within each interval)
- `anchor: <name>` — declares the user-facing anchor node (rendered filled); auto-creates a component at `[1.0, 0.0]` unless overridden by a `component:` line
- `component: <name> [visibility, evolution]` — places a node on the canvas; both coordinates are 0–1
- `link: A -> B` — dependency arrow from A to B
- Full-line `// comments` are ignored

**Axes:**
- Y = Visibility (0 = invisible infrastructure, 1 = direct user need at top)
- X = Evolution (0 = Genesis, 0.33 = Custom, 0.67 = Product, 1 = Commodity)

**Visual editing in Live Preview:**

Wardley Maps are fully editable without touching the source block:

| Action | Gesture |
|---|---|
| **Reposition** | Drag a component dot to a new position — coordinates update on release |
| **Add without link** | Hover a node → `+` handle appears → drag to new position → release to insert a new unlinked component |
| **Add + link** | Same gesture, but hold Shift while releasing to insert a new component and a link from the source |
| **Rename** | Double-click any component's circle or label → type new name → Enter |

All changes write back to the source block surgically — only the affected lines are patched.

---

### Playing to Win

~~~
```vizardry
type: ptw
block: Winning Aspiration
  Be the most trusted tool for distributed engineering teams, winning on simplicity and time-to-value — not feature count.

block: Strategic Issue
  Annual growth has stalled. Competitors are moving down-market into our SMB base.

block: Where To Play
  B2B SaaS / mid-market engineering teams (20–200 devs) / North America and Northern Europe / product-led growth — not enterprise, not agencies.

block: How To Win
  Fastest time-to-value in the market: zero-config setup, opinionated defaults, and native integrations with GitHub, Slack, and Linear that take minutes, not days.

block: Capabilities Needed
  World-class onboarding UX (first value in < 5 min)
  Real-time collaborative sync engine
  Deep integration partnership programme

block: Systems Required
  Continuous discovery cadence (weekly user interviews)
  Integration marketplace governance board
  NPS OKR tied to engineering lead compensation

block: Reverse Engineering
  INDUSTRY
  The SMB dev-tools market grows >20 % YoY and remains fragmented enough for a focused player to win.

  CUSTOMER VALUE
  Mid-market teams pay a premium for simplicity over a broader feature set.

  RELATIVE POSITION
  We build integration depth faster than competitors moving down-market.

  COMPETITIVE
  Network effects from our integration ecosystem create a moat that is slow to replicate.

block: Strategic Tests
  'Teams pay a premium for simplicity' — must be true / partially validated / run a pricing experiment with 3 cohorts this quarter.
  'Integration depth is defensible' — must be true / not yet validated / map competitor roadmaps and measure integration NPS vs. alternatives.
```
~~~

---

### Concept Map

A concept map models knowledge as a **directed graph** — concepts are nodes, and every edge carries a labeled relationship phrase that makes the connection explicit. Unlike a mind map (which radiates from a single root), a concept map is free-form: any concept can link to any other, cycles are valid, and cross-links between branches are the point.

~~~
```vizardry
type: conceptmap
title: Knowledge Domain

Photosynthesis -- requires --> Sunlight
Photosynthesis -- occurs in --> Plants
Photosynthesis -- produces --> Oxygen
Plants -- absorb --> Carbon Dioxide
Oxygen -- supports --> Life
Life -- depends on --> Water
Water -- enables --> Plants
```
~~~

Nodes are inferred automatically from the edges — no separate node declaration is needed. The layout is computed with a force-directed algorithm, so connected concepts cluster together and unconnected ones spread apart. A post-layout pass guarantees all nodes have at least 14 px of clearance regardless of label length.

**Syntax:**

| Line | Meaning |
|---|---|
| `A -- label --> B` | Directed edge from A to B with a relationship label |
| `A --> B` | Directed edge from A to B with no label |
| `title: <text>` | Optional canvas title (editable in Live Preview) |
| `// comment` | Ignored |

**Rules:**
- Nodes are collected from edge declarations in order of first appearance
- Self-loops (`A --> A`) are not allowed
- Multi-edges are allowed — the same pair of concepts can have multiple labeled relationships

---

### Node Map

An ERD-style diagram: you place labeled boxes exactly where you want them and draw the connecting lines yourself — nothing auto-arranges. Good for system diagrams, entity relationships, or any sketch where the layout itself carries meaning.

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

Boxes are draggable in Live Preview — grab one and drop it anywhere. Hover a box to reveal a "+" handle; drag it onto another box to link them (dropping on empty space cancels instead of creating a new box). Double-click a box's name to rename it, or its body text to edit it. Hover a box or link for a delete "×" and a color-swatch button.

**Syntax:**

| Line | Meaning |
|---|---|
| `box: <name> [x: <num>, y: <num>]` | A box at the given top-left position |
| `box: <name> [x: <num>, y: <num>, color: <name\|#hex>]` | A box with a color — palette name (red, orange, yellow, green, teal, blue, purple, pink, gray) or a `#hex` value |
| Indented lines under `box:` | Optional multi-line body text for that box |
| `link: A -> B` | Directed link (arrowhead at B) |
| `link: A <-> B` | Bidirectional link (arrowhead at both ends) |
| `link: A -- B` | Undirected link (no arrowhead) |
| `link: A -> B : <label>` | Link with a label |
| `link: A -> B [color: red, style: dashed]` | Link with a color and/or dashed line style |
| `title: <text>` | Optional canvas title |
| `// comment` | Ignored |

**Rules:**
- Coordinates are unbounded, non-negative numbers — the canvas grows to fit its content
- Box names must be unique and cannot contain `:` or brackets
- Self-links are not allowed, and every link must reference a declared box

---

## Linking elements to document headings

Any canvas element can navigate to a heading in the same note — not just a whole block, but every individual bullet line and every card. A small link icon signals the connection — clicking the block, bullet, card, or node jumps to that heading.

**Three ways to connect:**

*Inline wiki-link* — append `[[#Heading]]` to any element declaration, including a plain bullet line inside a block's content. Works everywhere: every grid canvas block (both the block itself and each of its content lines), Matrix, RACI, Pace Layers, OST, Impact Map, Mind Map, and every card on the card canvases (card-mode blocks, Story, Roadmap, SCQA grid, Journey):

~~~
```vizardry
type: lean
block: Problem [[#Problem Discovery]]
  Too many manual steps in the daily workflow [[#Manual Steps]]

block: Solution [[#Our Approach]]
  One-click automation for recurring tasks
```
~~~

Here both the `Problem` block itself and its individual bullet line carry their own, independent link.

*Inline Markdown link* — use standard Markdown anchor syntax `[label](#Anchor%20Text)` on the same line. The anchor is URL-decoded to match the heading:

~~~
```vizardry
type: kata
block: Next Experiment [Next Experiment](#Next%20Experiment)
  Ship a 5-step guided wizard
```
~~~

*Auto-detection* — write a note heading that matches an element label exactly (case-insensitive) and the link appears with no extra syntax at all. The link icon updates live whenever headings change — no need to edit the code block:

~~~
```vizardry
type: lean
block: Problem
  Too many manual steps

block: Solution
  One-click automation
```

## Problem

Background on the problem space...

## Solution

Details of the approach...
~~~

The `Problem` and `Solution` blocks automatically get link icons because matching headings exist in the note.

**Rules:**
- Inline annotations (`[[#Heading]]` or `[text](#Anchor)`) take priority over auto-detection
- Heading text is matched case-insensitively
- Annotations are stripped from display — only the element name is shown
- Auto-detected links on grid block labels and tree nodes update immediately when headings are added or renamed (no re-render of the code block needed); per-line and per-card links (block content lines, card-mode blocks, Matrix, RACI, Pace Layers, Story, Roadmap, SCQA grid, Journey) refresh on the next render

### Section preview

A linked box or card shows a preview of just the linked section — the heading down to the next heading of the same or higher level, not the whole note. Trigger it with **Cmd/Ctrl + hover** on desktop, or a **long-press** on mobile (a drag needs deliberate movement, so holding still opens the preview). Dismiss by moving away, scrolling, pressing Escape, or tapping the close button on mobile.

Currently available on grid boxes, Roadmap cards, and the card canvases (card-mode blocks, Matrix, Story, SCQA grid). Tree-node preview (OST, Mind Map, Impact, Fishbone, SCQA tree) is not wired yet.

### Explicit ticket annotations

The same `[label](target)` syntax used for heading links also recognizes an explicit Linear or Upvoty ticket key as the target, instead of a `#Heading` anchor:

~~~
```vizardry
type: lean
block: Solution
  Fix login redirect issue [Fix login redirect issue](CORE-1234)
```
~~~

This attaches a clickable ticket badge to a line even when its visible text doesn't contain the key itself — useful for a bullet written in prose. It's additive to, not a replacement for, the existing blind auto-detection that already turns a bare key like `CORE-1234` appearing anywhere in rendered text into a badge; this just covers the case auto-detection can't, where the key isn't in the visible text at all.

Requires the corresponding integration (Linear or Upvoty) to be configured in settings — otherwise the annotation is silently stripped and no badge is shown. If both a heading and a ticket key could apply to the same element, the heading link wins.

---

## Wardley Map — visual editing

In Live Preview, Wardley Maps support a full visual editing workflow:

**Drag to reposition** — grab any component dot and drag it across the map. A live coordinate tooltip shows `vis / evo` values while dragging. The source block updates on release.

**Add a component** — hover any node to reveal a `+` handle at its right edge. Drag from the handle to place a new connected component. The new component (`New Component`) and a link to the source are inserted into the source block automatically. Press Escape before releasing to create the component without a link.

**Rename** — double-click any component's circle or label. An inline input opens directly on that label. Type the new name and press Enter (or click away). The rename propagates to all references — the `component:` line, any `anchor:` line, and all `link:` lines in both positions.

---

## Canvas title bar controls

Each canvas title bar reveals a set of icon buttons on hover:

| Button | Action |
|---|---|
| **Edit source** (code icon) | Opens the code block in the editor for direct text editing |
| **Download** (arrow-down icon) | Saves a PNG of the canvas to your downloads folder at 2× resolution |
| **Present** (expand icon) | Opens a full-screen presentation overlay |

---

## Exporting a canvas as PNG

Each canvas has a **download icon** in its title bar, revealed on hover. Clicking it saves a PNG to your downloads folder at 2× resolution.

- Title bar controls are excluded from the image
- The filename matches the framework label, e.g. `Wardley Map.png`
- Works for every canvas type

---

## Presentation mode

Each canvas has an **expand icon** in its title bar. Tapping it opens a full-screen overlay — useful when presenting from your notes or mirroring to an external display.

- Grid canvases show all blocks at once (mobile carousel suspended)
- Larger type for readability at a distance
- **Dismiss:** tap ✕, press Escape, or swipe down

---

## Syntax reference

### Grid canvases (type: adkar, bmc, experiment, fourls, jobs, kata, lean, leanux, opportunity, ptw, rac, swot, vpc)

| Syntax | Meaning |
|---|---|
| `block: Label` | Start a block; label must match a framework block name |
| Indented lines below | Block content (multi-line, no special syntax needed) |
| `block: Label [[#Heading]]` | Link block to a heading in this note (wiki-link annotation) |
| `block: Label [text](#Anchor%20Text)` | Link block to a heading via Markdown anchor (URL-decoded) |
| `// comment` | Ignored |

### Image Carousel (type: carousel)

| Syntax | Meaning |
|---|---|
| One image per line | Standard Markdown: `![](image.png)` or `![Alt](image.png)` |
| Blank lines / `//` comments | Ignored |
| Fewer than 2 images | Error |

### Impact Map (type: impact)

| Syntax | Meaning |
|---|---|
| `goal:` | Root — no indent, required, one only |
| `actor:` | Level 1 — no indent, repeatable |
| `impact:` | Level 2 — indented under an actor |
| `deliverable:` | Level 3 — indented under an impact |

### Mind Map (type: mindmap)

| Syntax | Meaning |
|---|---|
| `root: Text` | Central node — no indent, required, one only |
| Indented lines | Child nodes at the indented depth |
| Blank lines / `// comment` | Ignored |

### Opportunity Solution Tree (type: ost)

Keyword-per-level, strict chain `outcome → opportunity → solution → experiment`, rendered as labelled swim-lanes. Several children are allowed at every level.

| Syntax | Meaning |
|---|---|
| `outcome: <text>` | Root — no indent, required, one only |
| `need:` / `pain:` / `desire: <text>` | Opportunity lane (level 1); the keyword sets the italic caption |
| `solution: <text>` | Indented under an opportunity |
| `experiment: <text>` | Indented under a solution |
| Bare indented line | A chevron bullet on the node above it (any node may have bullets) |
| Blank lines / `// comment` | Ignored |

Breaking change: `opportunity:` / `assumption:` and the legacy bare-indent form were removed — see the [Opportunity Solution Tree](#opportunity-solution-tree) section above for migration.

### SCQA / SCR Narrative (type: scqa, scr)

Keyword-per-level, strict chain `situation → complication → question → answer` (scqa) or `situation → complication → resolution` (scr). Several children are allowed at every level.

| Syntax | Meaning |
|---|---|
| `situation: <text>` | Root — no indent, required, one only |
| `complication: <text>` | Indented under the situation |
| `question: <text>` | Indented under a complication (scqa only) |
| `answer: <text>` | Indented under a question (scqa only) |
| `resolution: <text>` | Indented under a complication (scr only) |
| `view: grid \| tree` | Card grid (default) or swim-lane tree |
| Bare indented line under a node | A chevron bullet on that node (tree view) |
| Bare indented lines (no child keywords) | Legacy form — level by indentation, still rendered |
| Blank lines / `// comment` | Ignored |

### SIPOC Diagram (type: sipoc, table | flow)

One shared syntax, two views — `type: sipoc` (or `type: sipoc, table`) renders the table; `type: sipoc, flow` renders the same rows as a connected diagram. Switching back and forth never drops data: Owner/Metric are just not drawn in flow view, and `link:` lines are just not drawn (or validated) in table view.

| Syntax | Meaning |
|---|---|
| `row:` | Starts a new row at zero indent |
| Indented `supplier:` | Supplier cell value |
| Indented `input:` | Input cell value |
| Indented `process:` | Process cell value (column accented with theme colour) |
| Indented `output:` | Output cell value |
| Indented `customer:` | Customer cell value |
| Indented `owner:` | Owner cell — table-only; column hidden when unused by all rows |
| Indented `metric:` | Metric cell — table-only; column hidden when unused by all rows |
| `link: A -> B` | Flow-only; directed arrow between two cell values (deduped by text within their column) — any direction allowed, same-column links route vertically |
| Missing cell keys | Render as `—` (table view) |
| Blank lines / `// comment` | Ignored |

### User Story Map (type: story)

| Syntax | Meaning |
|---|---|
| `user: Description` | Optional persona in the canvas header |
| `goal: Description` | Optional objective in the canvas header |
| `activity: <name>` | Top-level backbone group |
| `step: <name>` | One grid column; must be unique across all activities |
| `task: <name>` or `task: <name> \| <subtitle>` | Task card with optional subtitle |
| `slice: <name>` | Priority band |
| Indented `step: <name> \| task A, task B` | Assigns tasks to this slice |

### Customer Journey Map / Service Blueprint (type: journey, journey blueprint)

| Syntax | Meaning |
|---|---|
| `persona: Description` | Optional persona in the canvas header |
| `scenario: Description` | Optional scenario in the canvas header |
| `phase: <name>` | One grid column; must be unique |
| `action:` / `touchpoint:` / `feeling:` / `painpoint:` / `opportunity:` | Journey lane card, optionally `\| <subtitle>` |
| `frontstage:` / `backstage:` / `support:` | Service Blueprint-only lane card (parsed but hidden under `type: journey`) |

### Venn Diagram (type: venn)

| Syntax | Meaning |
|---|---|
| `circle: <name>` | Defines a circle (2 or 3 total) |
| `- item text` | Item in the parent region |
| `- [[Note\|Alias]]` | Clickable note link |
| `intersection: A+B` | Items in the overlap of named circles |
| `center:` | 3-circle triple intersection |

### Wardley Map (type: wardley)

| Syntax | Meaning |
|---|---|
| `stages: Label A \\| Label B ...` | Optional custom x-axis labels; overrides default stage names |
| `stages:` + indented `0..1: Label` | Optional positioned x-axis labels; each position must be strictly between 0 and 1; positions define interval boundaries and labels are centered within each interval |
| `anchor: <name>` | User-facing anchor node (rendered filled) |
| `component: <name> [visibility, evolution]` | Node at normalised 0–1 coordinates |
| `link: A -> B` | Dependency arrow |
| `// comment` | Ignored |

### Concept Map (type: conceptmap)

| Syntax | Meaning |
|---|---|
| `A -- label --> B` | Directed edge from A to B with a relationship label |
| `A --> B` | Directed edge from A to B without a label |
| `title: <text>` | Optional canvas title |
| `// comment` | Ignored |

### Node Map (type: nodemap)

| Syntax | Meaning |
|---|---|
| `box: <name> [x: <num>, y: <num>]` | A box at the given top-left position |
| `box: <name> [x: <num>, y: <num>, color: <name\|#hex>]` | A box with a color |
| Indented lines under `box:` | Optional multi-line body text |
| `link: A -> B` / `A <-> B` / `A -- B` | Directed / bidirectional / undirected link |
| `link: A -> B : <label>` | Link with a label |
| `link: A -> B [color: red, style: dashed]` | Link with a color and/or dashed style |
| `title: <text>` | Optional canvas title |
| `// comment` | Ignored |

---

### Fishbone Diagram (type: fishbone)

| Syntax | Meaning |
|---|---|
| `effect: <text>` | The problem at the head of the diagram — required, one only |
| `category: <name>` | A cause category (e.g. People, Process, Technology) |
| `cause: <text>` | A contributing cause — indented under `category:` |
| `subcause: <text>` | A sub-level cause — indented under `cause:` |

---

### Now/Next/Later Roadmap (type: roadmap)

| Syntax | Meaning |
|---|---|
| `now:` / `next:` / `later:` | Column headers — each required once |
| `item: <name>` | A roadmap item |
| `item: <name> \| <key>` | Item with an optional ticket key (e.g. Linear/Jira ID) |

---

### Pace Layer Analysis (type: pacelayers)

The `type:` line self-identifies as `pacelayers` plus a variant, e.g. `type: pacelayers, product`.

| Syntax | Meaning |
|---|---|
| `type: pacelayers, <variant>` | Layout variant — `shearing` · `product` · `retro` (plain `type: <variant>` without the `pacelayers,` prefix also still works) |
| `context: <text>` | Optional one-line context shown in the header |
| `layer: <name>` | One pace layer |
| `note:` | Free text — used for outer layers (Fashion, Nature) |
| `obs:` | Observation from this layer |
| `feed:` | Signal or feedback from this layer |
| `idea:` | Action idea or hypothesis |

---

## Installation via BRAT (beta)

1. Install [BRAT](https://github.com/TfTHacker/obsidian42-brat) from the Obsidian community plugins
2. BRAT settings → **Add Beta Plugin**
3. Enter: `https://github.com/smsag/vizardry`
4. Enable **Vizardry** in Settings → Community plugins

---

## Manual installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/smsag/vizardry/releases)
2. Copy them into your vault at `.obsidian/plugins/vizardry/`
3. Enable **Vizardry** in Settings → Community plugins

---

## License

MIT © [Steffen Seitz](mailto:vizardry@grembl.de)
