# Vizardry

An [Obsidian](https://obsidian.md) plugin that renders product management frameworks as visual canvases inline in Read View — using fenced code blocks as input. Also includes an opt-in image carousel and a mind map renderer.

---

## How it works

Write a fenced code block with the framework name as the language tag. Use `block: Label` to define each section, with content indented below. Switch to **Read View** to see the rendered canvas. Edit View shows the raw text.

```
block: Label
  Content line 1
  Content line 2
  Content line 3
```

Multi-line content needs no special syntax — just indent everything below the `block:` line.

---

## Supported frameworks

| Code block | Framework | Layout |
|---|---|---|
| ` ```bmc ` | Business Model Canvas | 5-column grid |
| ` ```lean ` | Lean Canvas | 5-column grid |
| ` ```opportunity ` | Opportunity Canvas | 5-column grid |
| ` ```leanux ` | Lean UX Canvas | 5-column grid |
| ` ```vpc ` | Value Proposition Canvas | 2-column grid |
| ` ```kata ` | Product Kata | 2-column grid |
| ` ```jobs ` | Jobs Canvas | 3-column grid |
| ` ```impact ` | Impact Map | Hierarchical tree |
| ` ```story ` | User Story Map | Nested activity/step/task grid with priority bands |
| ` ```mindmap ` | Mind Map | Indented tree |

---

## Inserting a canvas

Three ways to insert a fully structured empty template at your cursor:

**Command palette** — `Cmd+P` (macOS) / `Ctrl+P` (Windows/Linux) → search **Insert canvas** → pick a framework from the fuzzy list.

**Per-framework commands** — search the framework name directly in `Cmd+P` (e.g. "Insert Business Model Canvas"). Each framework has its own command, bindable to a keyboard shortcut in Settings → Hotkeys.

**Ribbon icon** — tap the template icon in the left sidebar to open the same fuzzy picker.

On **mobile**, add any Vizardry command to the editor toolbar via Settings → Mobile → Edit toolbar for one-tap access above the keyboard.

---

## Examples

### Business Model Canvas

~~~
```bmc
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

### Lean Canvas

~~~
```lean
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

### Opportunity Canvas

~~~
```opportunity
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

### Lean UX Canvas

~~~
```leanux
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

### Value Proposition Canvas

~~~
```vpc
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

### Product Kata

~~~
```kata
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

### Jobs Canvas

~~~
```jobs
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

### Impact Map

~~~
```impact
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

**Impact Map syntax:**
- `goal:` — root, no indent, required, one only
- `actor:` — no indent, repeatable
- `impact:` — indented once under an actor
- `deliverable:` — indented twice under an impact

---

### User Story Map

~~~
```story
user: Team Lead
goal: Coordinate team and ship features reliably

activity Define:
  step Backlog:
    task Create ticket: title and acceptance criteria
    task Estimate: story points via planning poker
    task Assign: pick owner from team roster
  step Sprint Planning:
    task Build sprint: drag tickets from backlog
    task Set goal: one-line sprint objective

activity Build:
  step Development:
    task Start work: move ticket to in-progress
    task Open PR: linked to ticket with description
    task Request review: tag a reviewer
  step Review:
    task Read diff: leave inline comments
    task Approve: or request changes with notes
    task Merge: squash and merge to main

activity Ship:
  step QA:
    task Smoke test: cover critical user paths
    task Regression: run automated test suite
  step Release:
    task Tag version: apply semver tag
    task Deploy: one-click promote to production
    task Announce: post changelog to stakeholders

activity Improve:
  step Retrospective:
    task Collect feedback: team happiness score
    task Action items: owner and due date
  step Analytics:
    task Velocity chart: story points per sprint
    task Burndown: remaining work over time

slice: MVP
  step Backlog: Create ticket, Assign
  step Development: Start work, Open PR, Request review
  step Review: Read diff, Approve, Merge
  step Release: Deploy

slice: V1.1
  step Backlog: Estimate
  step Sprint Planning: Build sprint, Set goal
  step QA: Smoke test, Regression
  step Release: Tag version, Announce
```
~~~

**Story Map syntax:**
- `user:` — optional one-line persona description shown in the header
- `goal:` — optional one-line objective shown in the header
- `activity <name>:` — top-level backbone group; becomes a column-spanning header
- `step <name>:` — indented under an activity; each step is one grid column. Step names must be **globally unique** across all activities
- `task <name>: [subtitle]` — indented under a step; the optional subtitle is shown as secondary text in the task card. Task names must be unique within their parent step
- `slice: <name>` — priority band; assigns tasks to it using `step <name>: task A, task B`
- Tasks not assigned to any slice appear in a catch-all **Backlog** band at the bottom

---

### Mind Map

~~~
```mindmap
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

**Mind Map syntax:**
- `root:` — central node, no indent, required, one only
- Indented lines — child nodes; indent level determines depth in the tree
- Any consistent indent unit works (2 spaces, 4 spaces, tab)
- Blank lines and `# comment` lines are ignored
- Depth 1–3 get progressively lighter styling; depth 4+ uses a minimal leaf style

---

## Image Carousel

Automatically groups consecutive images in Read View into a navigable carousel. Activated per note via frontmatter — no global setting.

**Frontmatter** (must be the first lines in the file):

```yaml
---
carousel: true
---
```

**Grouping rules:**
- Finds all `<img>` elements in the rendered note
- Groups consecutive images where nothing else (text, heading, table, `---`, Vizardry canvas) appears between them
- Groups of **2 or more** images become a carousel; single isolated images are left untouched
- Two separate image groups in one note → two independent carousels

**Controls:**
- Left / right arrow buttons
- Dot indicators — one per image, clickable to jump directly
- Keyboard `←` / `→` when the carousel is focused
- Swipe left / right on mobile

---

## Linking blocks to document headings

Add a `_links:` section to connect canvas blocks to headings elsewhere in the same note. A small link icon appears on the block — tapping it navigates to that heading.

~~~
```lean
block: Problem
  Too many manual steps in the daily workflow

block: Solution
  One-click automation for recurring tasks

block: Customer Segments
  Solo founders and freelancers

_links:
  Problem: 1. Why? — Problem & Opportunity
  Solution: 2. How? — Our Approach
  Customer Segments: 3. Who? — Target Users
```
~~~

- Block labels in `_links:` are case-insensitive
- Heading text must match the document heading exactly
- Only linked blocks show the icon
- Works with any grid framework

---

## Presentation mode

Each canvas has a small expand icon in its title bar. Tapping it opens a full-screen overlay covering the entire Obsidian UI — including sidebars and toolbars.

**On iPhone connected to Apple TV via screen mirroring**, this fills the TV output, giving you a clean single-canvas view directly from your notes.

- Grid canvases show all blocks at once (mobile carousel is suspended)
- Larger type for readability at a distance
- Impact Maps and Story Maps scroll vertically within the overlay
- **Dismiss:** tap ✕, press Escape, or swipe down

---

## Syntax reference

### Grid canvases (bmc, lean, opportunity, leanux, vpc, kata, jobs)

| Syntax | Meaning |
|---|---|
| `block: Label` | Start a block; label must match a framework block name |
| Indented lines below | Block content (multi-line, no special syntax needed) |
| `_links:` | Start the heading links section |
| Indented `Label: Heading text` | Link a block to a document heading |
| `# comment` | Ignored line |
| Unknown block labels | Silently ignored |

### Impact Map (impact)

| Syntax | Meaning |
|---|---|
| `goal:` | Root node — no indent, required, one only |
| `actor:` | Level 1 — no indent, repeatable |
| `impact:` | Level 2 — indented under an actor |
| `deliverable:` | Level 3 — indented under an impact |

### User Story Map (story)

| Syntax | Meaning |
|---|---|
| `user: Description` | Optional persona — shown in the canvas header |
| `goal: Description` | Optional objective — shown in the canvas header |
| `activity <name>:` | Top-level backbone group; spans its child step columns |
| `step <name>:` | Indented under activity; one grid column. Must be unique across all activities |
| `task <name>: [subtitle]` | Indented under step; renders as a task card with optional subtitle. Must be unique within its step |
| `slice: <name>` | Priority band |
| Indented `step <name>: task A, task B` | Assigns comma-separated tasks to this slice |
| Unassigned tasks | Collected into a **Backlog** band at the bottom |

### Mind Map (mindmap)

| Syntax | Meaning |
|---|---|
| `root: Text` | Central node — no indent, required, one only |
| Indented lines | Child nodes; depth determined by indent level |
| Blank lines | Ignored (use freely for readability) |
| `# comment` | Ignored |

### Image Carousel

| Syntax | Meaning |
|---|---|
| `carousel: true` in frontmatter | Activates carousel grouping for the note |
| No frontmatter key or `carousel: false` | Images render normally |

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
