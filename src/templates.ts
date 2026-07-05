import type { FrameworkDefinition } from "./types";

export function generateCanvasTemplate(framework: FrameworkDefinition): string {
  const blocks = framework.blocks.map(b => `block: ${b.label}\n  `).join("\n\n");
  return `\`\`\`${framework.id}\ntitle: ${framework.label}\n\n${blocks}\n\`\`\`\n`;
}

export const FISHBONE_TEMPLATE = `\`\`\`fishbone
title: Fishbone Diagram

effect: Problem statement

category: People
  cause: Lack of training
    subcause: No onboarding process
  cause: High turnover

category: Process
  cause: Unclear requirements
  cause: Manual handoffs

category: Technology
  cause: Legacy system
    subcause: No API available
  cause: Missing monitoring
\`\`\`
`;

export const IMPACT_MAP_TEMPLATE = `\`\`\`impact
title: Impact Map

goal: Increase the number of activated users in the first 30 days

actor: New User
  impact: Reaches first value moment faster
    deliverable: Interactive onboarding wizard
    deliverable: Contextual tooltips on first login
  impact: Understands the product without reading docs
    deliverable: Sample project pre-loaded on sign-up

actor: Support Team
  impact: Receives fewer "how do I start?" tickets
    deliverable: In-app help centre with search
    deliverable: Onboarding progress visible in admin panel

actor: Growth Team
  impact: Can identify where users drop off
    deliverable: Funnel analytics for each onboarding step
    deliverable: Automated nudge emails at day 1, 3, and 7
\`\`\`
`;

export const STORY_MAP_TEMPLATE = `\`\`\`story
title: User Story Map

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
\`\`\`
`;

export const MIND_MAP_TEMPLATE = `\`\`\`mindmap
title: Mind Map

root: Central Topic

  Branch One
    Sub-item A
    Sub-item B

  Branch Two
    Nested Group
      Deep Item 1
      Deep Item 2
    Standalone Item

  Branch Three
\`\`\`
`;

export const VENN_TEMPLATE = `\`\`\`venn
title: Venn Diagram

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
\`\`\`
`;

export const OST_TEMPLATE = `\`\`\`ost
title: Opportunity Solution Tree

outcome: Your desired outcome

  Opportunity one
    Solution A
      Experiment 1
    Solution B

  Opportunity two
    Solution C
\`\`\`
`;

export const CAROUSEL_TEMPLATE = `\`\`\`carousel
![](image-one.png)
![](image-two.png)
![](image-three.png)
\`\`\`
`;

export const SIPOC_TEMPLATE = `\`\`\`sipoc
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

row:
  supplier: Cloud provider
  input: Docker image
  process: Deploy to production
  output: Alert rules
  customer: Product owner
\`\`\`
`;

export const SIPOC_FLOW_TEMPLATE = `\`\`\`sipoc
type: flow
title: SIPOC Flow Diagram

suppliers:
  Supplier 1 [ellipse]
  Supplier 2 [ellipse]

inputs:
  Data 1 [parallelogram]
  Data 2 [parallelogram]
  Data 3 [parallelogram]

process:
  Step 1 [rect]
  Step 2 [rect]
  Step 3 [rect]
  Step 4 [rect]
  Step 5 [rect]

outputs:
  Data 4 [parallelogram]
  Data 5 [parallelogram]

customers:
  Customer 1 [ellipse]
  Customer 2 [ellipse]
  Customer 3 [ellipse]

link: Supplier 1 -> Data 1
link: Supplier 1 -> Data 2
link: Supplier 2 -> Data 3
link: Data 1 -> Step 1
link: Data 2 -> Step 3
link: Data 3 -> Step 3
link: Step 1 -> Step 2
link: Step 2 -> Step 3
link: Step 3 -> Step 4
link: Step 4 -> Step 5
link: Step 2 -> Data 4
link: Step 5 -> Data 5
link: Data 4 -> Customer 1
link: Data 4 -> Customer 2
link: Data 5 -> Customer 3
\`\`\`
`;

export const WARDLEY_TEMPLATE = `\`\`\`wardley
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
\`\`\`
`;

export const ROADMAP_TEMPLATE = `\`\`\`roadmap
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
\`\`\`
`;

export const RACI_TEMPLATE = `\`\`\`raci
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

task: Test & sign off
  responsible: QA
  accountable: PM
  consulted: Developer
  informed: Stakeholder
\`\`\`
`;

export const CONCEPT_MAP_TEMPLATE = `\`\`\`conceptmap
title: Knowledge Domain

Photosynthesis -- requires --> Sunlight
Photosynthesis -- occurs in --> Plants
Photosynthesis -- produces --> Oxygen
Plants -- absorb --> Carbon Dioxide
Oxygen -- supports --> Life
Life -- depends on --> Water
Water -- enables --> Plants
\`\`\`
`;

export const PACE_LAYERS_TEMPLATE = `\`\`\`pacelayers
// type: shearing | product | retro
type: shearing
title: Pace Layer Analysis
context: Our SaaS product — B2B team collaboration tool

layer: Fashion
  note: Team sentiment is shifting toward async-first. Standup fatigue is real.

layer: Commerce
  note: Quarterly OKRs are locked. Activation rate is the primary growth lever this quarter.

layer: Infrastructure
  obs: Auth service is a bottleneck — every new integration depends on it
  feed: Engineers report deploy confidence is low without better observability
  idea: Introduce feature flags to decouple deploy from release

layer: Governance
  obs: SOC 2 audit is scheduled for Q3 — data handling policies need review
  feed: Legal flagged that session token storage doesn't meet new requirements
  idea: Rewrite auth middleware; document data retention policy

layer: Culture
  obs: Team defaults to shipping fast over shipping well — tech debt is accumulating
  feed: Retrospectives surface the same friction points every sprint
  idea: Introduce a "quality sprint" once per quarter

layer: Nature
  note: Network effects are structural — the product becomes more valuable as more teammates join. Every feature decision should consider how it affects team-wide adoption.
\`\`\`
`;

export const MATRIX_PAIN_TEMPLATE = `\`\`\`matrix
type: pain
title: Pain Point Matrix

block: very-major-1 | card
  Checkout fails on mobile
  Payment provider rejects wallets

block: very-major-2
  Onboarding takes > 30 min

block: very-major-3
  SSO setup requires IT ticket

block: very-major-4
  Data export corrupts special characters

block: major-1 | card
  Search returns stale results
  Filters reset on page reload

block: major-2
  Notifications arrive hours late

block: major-3
  No bulk-edit on list view

block: major-4
  PDF reports miss last row

block: minor-1
  Dashboard loads slowly on first visit

block: minor-2
  Date picker defaults to wrong timezone

block: minor-3
  Avatar upload crops faces incorrectly

block: minor-4
  Tooltip overlaps button on small screens

block: very-minor-1
  Hover state missing on secondary nav

block: very-minor-2
  Success toast disappears too fast

block: very-minor-3
  Changelog link 404s in footer

block: very-minor-4
  Favicon not shown in Safari pinned tabs
\`\`\`
`;

export const MATRIX_OPP_TEMPLATE = `\`\`\`matrix
type: opportunity
title: Opportunity Matrix

block: very-major-1 | card
  Self-serve onboarding wizard
  In-app sample project

block: very-major-2
  AI-assisted task summarisation

block: very-major-3
  Native mobile app

block: very-major-4
  On-premise deployment option

block: major-1 | card
  Saved filter presets
  Keyboard shortcut layer

block: major-2
  Public API with webhooks

block: major-3
  Advanced role-based permissions

block: major-4
  White-label theming per workspace

block: minor-1
  Quick-add from notification tray

block: minor-2
  CSV import for bulk data entry

block: minor-3
  Two-way calendar sync

block: minor-4
  Custom email notification templates

block: very-minor-1
  Drag-to-reorder sidebar sections

block: very-minor-2
  Collapsible panel in list view

block: very-minor-3
  Dark mode for embedded widgets

block: very-minor-4
  Branded share links
\`\`\`
`;

export const MATRIX_IMPACT_TEMPLATE = `\`\`\`matrix
type: impact
title: Impact / Effort Matrix

block: very-major-1 | card
  Fix mobile checkout flow
  Add saved filter presets

block: very-major-2
  Self-serve onboarding wizard

block: very-major-3
  Public API with webhooks

block: very-major-4
  On-premise deployment option

block: major-1 | card
  Keyboard shortcut layer
  Quick-add from notification tray

block: major-2
  AI-assisted task summarisation

block: major-3
  Advanced role-based permissions

block: major-4
  Native mobile app

block: minor-1
  CSV import for bulk data entry

block: minor-2
  Two-way calendar sync

block: minor-3
  Collapsible panel in list view

block: minor-4
  Custom email notification templates

block: very-minor-1
  Drag-to-reorder sidebar sections

block: very-minor-2
  Dark mode for embedded widgets

block: very-minor-3
  Branded share links

block: very-minor-4
  Changelog link fix in footer
\`\`\`
`;

export const SCQA_TEMPLATE = `\`\`\`scqa
title: SCQA Narrative

situation: Conversion has been flat at 3% for two years
  Competitor shipped one-click checkout
    How quickly can we match it?
      Ship express checkout in Q3
    Do we build or buy the wallet layer?
      Pilot a third-party wallet first
  Cart abandonment is up 8% this quarter
    Where do users drop off?
      Instrument the funnel before deciding
\`\`\`
`;

export const SCR_TEMPLATE = `\`\`\`scr
title: SCR Narrative

situation: Checkout ran at 99.9% uptime all year
  A config push took payments down for 40 minutes
    Add staged rollout with an automated config canary
  On-call paging was delayed by 12 minutes
    Route payment alerts to a dedicated high-priority channel
\`\`\`
`;
