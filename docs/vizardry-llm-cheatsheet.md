# Vizardry LLM Cheatsheet

Condensed reference for generating valid Vizardry code blocks in Obsidian.
Full reference: [vizardry-canvas-syntax-reference.md](vizardry-canvas-syntax-reference.md)

## Rules

1. Fence with ` ```vizardry ` … ` ``` `. Never ` ```bmc ` or other per-framework fences.
2. `type: <id>` is required. Variant syntax: `type: matrix, pain`.
3. Indentation is structural — use 2 spaces consistently, never tabs.
4. Keywords end with a colon (`block:`, `item:`) — except in conceptmap, mindmap, ost, venn.
5. Comments: `// text` on its own line only. Inline `//` stripped only in wardley and pacelayers.
6. Blank lines are ignored everywhere.
7. Grid block labels must match exactly (case-insensitive); typos silently dropped.
8. Don't quote values: `title: My Map`, not `title: "My Map"`.
9. One `title:` line per canvas (optional).
10. Repeat `type:` in one fence → **carousel** with prev/next navigation.

Globals: `collapsed: true` starts minimised. Links on labels: `[[#Heading]]`, `[text](#Anchor%20Text)`, `[text](TICKET-KEY)`, `[text](canvas:Other Title)`.

## Framework index

| `type:` value | Canvas | Kind |
| --- | --- | --- |
| `adkar` | ADKAR Change Model | Grid |
| `bmc` | Business Model Canvas | Grid |
| `experiment` | Experiment Canvas | Grid |
| `fourls` | 4Ls Retrospective | Grid |
| `futureself` | Future Self | Grid |
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
| `matrix, pain` | Pain Point Matrix (4×4) | Matrix |
| `matrix, opportunity` | Opportunity Matrix (4×4) | Matrix |
| `matrix, impact` | Impact / Effort Matrix (4×4) | Matrix |
| `matrix, assumption` | Assumption Map (4×4) | Matrix |
| `matrix, scenario` | Scenario Matrix (2×2) | Matrix |
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
| `sipoc, flow` | SIPOC Flow | SVG flow |
| `journey` | Customer Journey Map | Lanes |
| `journey, blueprint` | Service Blueprint | Lanes |
| `venn` | Venn Diagram | SVG overlap |
| `wardley` | Wardley Map | SVG canvas |
| `wheeloflife` | Wheel of Life | SVG wheel |
| `odyssey` | Odyssey of Life | Plan cards |
| `circleofinfluence` | Circle of Influence | Rings |
| `wholeperson` | Whole Person | SVG wheel |
| `radar` | Radar / Spider Chart | SVG chart |
| `problem` / `problem, engineering` | Problem Statement (engineering) | SVG flow |
| `problem, business` | Problem Statement (business) | SVG flow |
| `problem, research` | Problem Statement (research) | SVG flow |
| `problem, fivew` | Problem Statement (5W+H) | SVG flow |
| `testcard` | Test Card | Card |
| `compass` | Product Compass | Brief |

## Grid canvases

Shared syntax — `block: <Label>` with indented content lines:

~~~
```vizardry
type: swot
title: SWOT Analysis
block: Strengths
  Strong brand recognition
  Experienced engineering team
block: Weaknesses
  Limited marketing budget
```
~~~

`block: Label | card` → draggable card items. `cards: all` → all blocks as cards.

### Block labels per framework

| `type:` | Block labels |
| --- | --- |
| `adkar` | Awareness · Desire · Knowledge · Ability · Reinforcement |
| `bmc` | Key Partners · Key Activities · Key Resources · Value Propositions · Customer Relationships · Channels · Customer Segments · Cost Structure · Revenue Streams |
| `experiment` | Hypothesis · Test · Metric · Success Criteria · Observation · Learning · Decision |
| `fourls` | Liked · Learned · Lacked · Longed For · Actions |
| `futureself` | As-Is · To-Be · Actions *(all card blocks; also accepts `period: <text>`)* |
| `jobs` | Job Performer · Main Job · Circumstances · Functional Aspects · Emotional Aspects · Social Aspects · Current Solutions · Desired Outcomes · Obstacles |
| `kata` | Current Condition · Target Condition · Obstacles · Next Experiment · Expected Outcome |
| `lean` | Problem · Solution · Unique Value Proposition · Unfair Advantage · Customer Segments · Key Metrics · Channels · Cost Structure · Revenue Streams |
| `leanux` | Business Problem · Business Outcomes · Users · User Outcomes & Benefits · Solutions · Hypotheses · Most Important Thing to Learn First · Minimum Experiment |
| `opportunity` | Problem / Opportunity · Solution Ideas · Target Users · User Outcomes · User Metrics · Business Problem · Business Metrics · Budget · Adoption Factors · Factors for Success |
| `ptw` | Winning Aspiration · Strategic Issue · Where To Play · How To Win · Capabilities Needed · Systems Required · Reverse Engineering · Strategic Tests |
| `rac` | Customers · Problem · Solution · MVP · Competition · Sales Channels · Top Riskiest Assumptions |
| `swot` | Strengths · Weaknesses · Opportunities · Threats |
| `vpc` | Products & Services · Pain Relievers · Gain Creators · Customer Jobs · Pains · Gains |

## User Story Map (`story`)

~~~
```vizardry
type: story
user: Team Lead
goal: Ship features reliably
activity: Define
  step: Backlog
    task: Create ticket
    task: Estimate | story points
  step: Sprint Planning
    task: Build sprint | drag from backlog
slice: MVP
  step: Backlog | Create ticket
  step: Sprint Planning | Build sprint
```
~~~

`step:` names must be unique across the whole map. `task: Name | subtitle` for a subtitle line. `slice:` assigns tasks by name to a priority band; unassigned tasks go to Backlog.

## Matrix

- `type: matrix` → blank (supply `x:` and `y:`). `type: matrix, <preset>` → preset axes.
- Presets: `pain` · `opportunity` · `impact` · `assumption` (4×4), `scenario` (2×2).
- Axes: `x: Title | tick | tick | …` (left→right), `y: Title | tick | tick | …` (bottom→top).
- Cells numbered `t1…t(N×M)` reading order, **t1 = top-left**.
- `tN: Name | heat` — name/tint a cell. Heat: `very-high` / `high` / `medium` / `low`.
- `item: Label at: tN` (snap to cell) or `item: Label [x, y]` (free coord 0–1, origin bottom-left).
- Indented lines under `item:` → description popover. Item labels must be unique.

4×4 cell grid: `t1 t2 t3 t4 / t5 t6 t7 t8 / t9 t10 t11 t12 / t13 t14 t15 t16`.
2×2 cell grid: `t1 t2 / t3 t4`.

| Preset | y (top→bottom) | x (left→right) | Hot corner |
| --- | --- | --- | --- |
| `pain` | Very Major → Very Minor Pain | Everyone → Few | t1 |
| `opportunity` | Very Major → Very Minor Benefit | Low → Very High Effort | t1 |
| `impact` | Very High → Very Low Impact | Very Low → Very High Effort | t1 |
| `assumption` | Very High → Very Low Importance | No → Strong Evidence | t1 |
| `scenario` | Uncertainty B: High / Low | Uncertainty A: Low / High | — |

~~~
```vizardry
type: matrix, impact
title: Q3 Prioritisation
item: Fix mobile checkout at: t1
  Wallet payments rejected
item: Filter presets at: t2
item: AI summaries at: t7
item: Dark mode [0.28, 0.24]
```
~~~

For links on matrix items, place annotation **before** `at:` or `[x,y]`: `item: Fix login [Fix](CORE-1234) at: t1`.

## SCQA / SCR (`scqa` · `scr`)

SCQA: `situation:` → `complication:` → `question:` → `answer:`.
SCR: `situation:` → `complication:` → `resolution:`.
One root `situation:`, children nested by indent. `view: tree` for tree layout (default: `grid`).

~~~
```vizardry
type: scqa
situation: Conversion flat at 3%
  complication: Competitor shipped one-click checkout
    question: How quickly can we match it?
      answer: Ship express checkout in Q3
    question: Build or buy the wallet layer?
      answer: Pilot a third-party wallet first
```
~~~

## Image Carousel (`carousel`)

One Markdown image per line, minimum 2.

~~~
```vizardry
type: carousel
![Caption one](image-one.png)
![Caption two](image-two.png)
```
~~~

## Concept Map (`conceptmap`)

Directed graph — nodes auto-collected from edges. No node declarations.

~~~
```vizardry
type: conceptmap
title: Knowledge Domain
Photosynthesis -- requires --> Sunlight
Photosynthesis -- produces --> Oxygen
Oxygen --> Life
```
~~~

`A -- label --> B` = labelled edge. `A --> B` = unlabelled. No self-loops.

## Node Map (`nodemap`)

Boxes at manual coordinates (unbounded non-negative units, canvas grows to fit). Max 50 boxes.

~~~
```vizardry
type: nodemap
title: System Overview
box: Service A [x: 40, y: 40, color: blue]
box: Service B [x: 320, y: 40]
  Handles validation
link: Service A -> Service B : sends data
link: Service B <-> Service A [color: green, style: dashed]
```
~~~

Links: `->` directed, `<->` bidirectional, `--` undirected. `[color: <c>, style: dashed]` optional. Colors: `red` `orange` `yellow` `green` `teal` `blue` `purple` `pink` `gray` or `#hex`.

## Fishbone (`fishbone`)

~~~
```vizardry
type: fishbone
effect: High customer churn
category: Product
  cause: No in-app guidance
    subcause: Empty state gives no direction
  cause: Setup takes too long
category: Communication
  cause: Onboarding emails irrelevant
```
~~~

One `effect:` required. `category:` → `cause:` → `subcause:`.

## Impact Map (`impact`)

~~~
```vizardry
type: impact
goal: Increase retention by 15%
actor: Product Team
  impact: Reduce time-to-value
    deliverable: Onboarding wizard
    deliverable: Templates
actor: Marketing
  impact: Re-engage dormant users
    deliverable: Reactivation emails
```
~~~

One `goal:` required. `actor:` → `impact:` → `deliverable:`.

## Mind Map (`mindmap`)

Indent depth = tree level. No keywords below root.

~~~
```vizardry
type: mindmap
root: Central topic
  Branch A
    Leaf 1
    Leaf 2
  Branch B
    Leaf 3
```
~~~

One `root:` required. Use consistent indent unit (2 spaces).

## Opportunity Solution Tree (`ost`)

~~~
```vizardry
type: ost
outcome: 2× rental listings
  need: Tenants who pay on time
    solution: Renter info platform
      Tenant credit checks
      experiment: Usability testing
  pain: Anxious about paperwork
  desire: Tenant reviews from landlords
```
~~~

Chain: `outcome:` → `need:`/`pain:`/`desire:` → `solution:` → `experiment:`. Bare indented lines become bullets on the parent node.

## Pace Layers (`pacelayers`)

Variants: `pacelayers` (= `shearing`), `pacelayers, product`, `pacelayers, retro`.
Six layers: `Fashion` · `Commerce` · `Infrastructure` · `Governance` · `Culture` · `Nature`.

~~~
```vizardry
type: pacelayers
context: Our SaaS product
layer: Commerce
  obs: Purchasing cycle slowing
  feed: Enterprise deals up 30%
  idea: Volume pricing tier
layer: Infrastructure
  obs: DB costs rising 15% QoQ
```
~~~

Sub-keys: `note:`, `obs:` (observation), `feed:` (feedback/signal), `idea:`. Layer names also accept their variant display labels as aliases.

## RACI (`raci`)

~~~
```vizardry
type: raci
task: Define requirements
  responsible: Developer
  accountable: PM
  consulted: QA
  informed: Stakeholder
task: Build feature
  responsible: Developer
  accountable: PM
```
~~~

Multiple people per cell: comma-separated.

## Roadmap (`roadmap`)

~~~
```vizardry
type: roadmap
now:
  item: Ship login flow | CORE-1234
  item: Fix checkout bug
next:
  item: Onboarding redesign
later:
  item: Dark mode
```
~~~

`item: Name | TICKET-KEY` renders a linked badge when Linear/Upvoty integration is active.

## SIPOC (`sipoc`)

Table view (default: `sipoc` / `sipoc, table`) or flow view (`sipoc, flow`). Same data.

~~~
```vizardry
type: sipoc
row:
  supplier: Dev team
  input: Feature branch
  process: Build & test
  output: Running service
  customer: End users
```
~~~

Optional: `owner:`, `metric:` (table-only). Flow view adds `link: A -> B` between cell values.

## Journey / Blueprint (`journey`)

`type: journey` = 5 lanes. `type: journey, blueprint` adds frontstage/backstage/support.

~~~
```vizardry
type: journey
persona: Returning shopper
scenario: Reorder after failed renewal
phase: Awareness
  action: Receives failed-renewal email
  touchpoint: Email notification
  feeling: Confused | Didn't expect failure
  painpoint: Unclear why it failed
  opportunity: One-tap retry link
phase: Resolution
  action: Updates card details
  feeling: Relieved | Quick once found
```
~~~

Blueprint adds under `phase:`: `frontstage:`, `backstage:`, `support:`. All lane lines accept `| subtitle`.

## Venn (`venn`)

2 or 3 circles. Items are `- ` prefixed bullets.

~~~
```vizardry
type: venn
circle: Design
  - User research
circle: Engineering
  - Architecture
intersection: Design+Engineering
  - Prototyping
center:
  - Product vision
```
~~~

`center:` = triple intersection (3-circle only). Circle name order in `intersection:` doesn't matter.

## Wardley Map (`wardley`)

Y = visibility (1 = top, user-facing). X = evolution (0 = genesis, 1 = commodity). Coords: `[visibility, evolution]`.

~~~
```vizardry
type: wardley
stages: Genesis | Custom | Product | Commodity
anchor: User
component: User         [1.00, 0.10]
component: Web App      [0.85, 0.35]
component: Database     [0.40, 0.60]
link: User -> Web App
link: Web App -> Database
evolve: Database 0.85
pipeline: Database [0.35, 0.75]
  Managed DB [0.70]
```
~~~

`stages:` accepts pipe-separated labels or indented `0.10: Label` positioned entries. Inline `// comments` are stripped. `anchor:` auto-placed at `[1.0, 0.0]` unless a `component:` overrides it.

## Wheel of Life (`wheeloflife`)

~~~
```vizardry
type: wheeloflife
area: Career | 7 | Growing but stretched
area: Health | 4
area: Fun | 3
```
~~~

`area: Name | score` (0–10). Optional `| note` after score. 2–12 areas.

## Odyssey (`odyssey`)

~~~
```vizardry
type: odyssey
plan: A | The Steady Climb
  archetype: Current path, leveled up
  year 1: Ship the rewrite
  year 5: Head of Product
  gauge: Confidence | 8
  gauge: Resources | 6
  question: Do I want to manage people?
plan: B | Indie Maker
  year 1: Launch a side project
  gauge: Confidence | 4
```
~~~

`plan: Label | Title` or `plan: Title` (auto-lettered). 2–4 plans. Gauges 0–10. Timeline sorts by year.

## Circle of Influence (`circleofinfluence`)

~~~
```vizardry
type: circleofinfluence
concern: The economy
concern: Competitor moves
influence: Team morale
control: My daily priorities
```
~~~

Three rings: `concern:` (outer) · `influence:` (middle) · `control:` (inner, optional). Min 2 items total, max 8 per ring.

## Whole Person (`wholeperson`)

~~~
```vizardry
type: wholeperson
body: 6 | Run 3× a week | Sleep 7h
mind: 7 | Read 20 min daily
heart: 5 | Weekly date night
spirit: 4 | Morning meditation
```
~~~

Four dimensions: `body:` · `mind:` · `heart:` · `spirit:`. Score 0–10, then optional `| activity` entries (up to 5).

## Radar (`radar`)

~~~
```vizardry
type: radar
axis: We anticipate changes | 6
axis: Fast decision-making | 4
axis: Effective prioritisation | 7
axis: Solid risk management | 6
```
~~~

3–12 axes, each scored 0–10. Plotted as a filled polygon on evenly-spaced spokes.

## Problem Statement (`problem`)

Four subtypes with different stage keywords:

| `type:` | Stages (left → right) |
| --- | --- |
| `problem` / `problem, engineering` | `ideal` · `reality` · `consequences` · `proposal` |
| `problem, business` | `vision` · `issue` · `method` |
| `problem, research` | `context` · `issue` · `relevance` · `objective` |
| `problem, fivew` | `where` · `when` · `what` · `who` · `why` · `how` |

~~~
```vizardry
type: problem, engineering
ideal_1: Automated line | Parts assemble efficiently
reality_1: Manual transport | Parts carried by hand
consequences_1: Missed goals | Behind production target
proposal_1: Install conveyor belts
link: ideal_1 -> reality_1
link: reality_1 -> consequences_1 -> proposal_1
```
~~~

Cards: `<stage>_<id>: heading | body` (bare `<stage>: heading` auto-numbers). Links reference card ids. Chain syntax: `A -> B -> C`. Group/fan-out: `A -> B & C`.

## Test Card (`testcard`)

~~~
```vizardry
type: testcard
deadline: 2026-09-01
hypothesis: Customers will pay $49/mo
critical: 3
test: Two-week paywall A/B test
cost: 2
reliability: 2
metric: Paid conversion rate
time: 1
criteria: Conversion exceeds 5%
```
~~~

Steps: `hypothesis:` → `test:` → `metric:` → `criteria:`. Gauges (0–3): `critical:` (step 1), `cost:` + `reliability:` (step 2), `time:` (step 3). All fields optional.

## Product Compass (`compass`)

~~~
```vizardry
type: compass
title: Personalized Onboarding
forces: Users abandon setup halfway
problem: New shops can't activate fast enough
insight: 40% | of shops abandon before activation
insight: 3× | higher churn for manual accounts
northstar: 50% of shops activate within day one
idea: Guided wizard [OST](canvas:Onboarding OST)
gtm: Roll out to new signups first
pricing: Included in all tiers
```
~~~

Sections: **Challenge** (`forces:`, `problem:`, `insight:` — all repeatable; `insight: figure | text` → stat tile), **North Star** (`northstar:` — single, first wins), **Solution & Test** (`idea:` — repeatable, link hub), **Go-To-Market** (`gtm:`, `pricing:` — repeatable).

## Links

Append to any element label: `[[#Heading]]` (wiki heading), `[text](#Anchor%20Text)` (markdown anchor), `[text](TICKET-KEY)` (Linear/Upvoty ticket), `[text](canvas:Title)` (another canvas in the same note by title). Auto-detection: if a note heading matches a label exactly, the link appears automatically. For matrix items, place link **before** `at:` or `[x,y]`.

## Generation checklist

Before returning a canvas:

- [ ] Fenced with ` ```vizardry ` … ` ``` `
- [ ] Valid `type:` from the framework index
- [ ] Grid block labels match the framework's list exactly
- [ ] Consistent 2-space indentation, no tabs
- [ ] No inline `//` comments (except wardley/pacelayers)
- [ ] Matrix: cell ids in range; item labels unique; `[x,y]` origin bottom-left
- [ ] Wardley: coords `[visibility, evolution]` both 0–1
- [ ] No quotes around values
