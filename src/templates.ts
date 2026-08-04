import type { FrameworkDefinition } from "./types";

export function generateCanvasTemplate(framework: FrameworkDefinition): string {
  const blocks = framework.blocks.map(b => `block: ${b.label}\n  `).join("\n\n");
  return `\`\`\`vizardry\ntype: ${framework.id}\ntitle: ${framework.label}\n\n${blocks}\n\`\`\`\n`;
}

export const FISHBONE_TEMPLATE = `\`\`\`vizardry
type: fishbone
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

export const IMPACT_MAP_TEMPLATE = `\`\`\`vizardry
type: impact
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

export const STORY_MAP_TEMPLATE = `\`\`\`vizardry
type: story
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

export const MIND_MAP_TEMPLATE = `\`\`\`vizardry
type: mindmap
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

export const VENN_TEMPLATE = `\`\`\`vizardry
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

export const OST_TEMPLATE = `\`\`\`vizardry
type: ost
title: Opportunity Solution Tree

outcome: 2x the rental listings on the platform in mid-west areas of the US

  need: I want to rent out my house to tenants who pay on time.
    solution: Provide a platform to view renter information in one place.
      Tenant credit checks
      Background checks
      Income verification
      experiment: Usability testing with landlords

  pain: I feel anxious about all the documentation.

  desire: I'd like tenant reviews from previous landlords.
\`\`\`
`;

export const CAROUSEL_TEMPLATE = `\`\`\`vizardry
type: carousel
![](image-one.png)
![](image-two.png)
![](image-three.png)
\`\`\`
`;

export const SIPOC_TEMPLATE = `\`\`\`vizardry
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

row:
  supplier: Cloud provider
  input: Docker image
  process: Deploy to production
  output: Alert rules
  customer: Product owner
\`\`\`
`;

export const SIPOC_FLOW_TEMPLATE = `\`\`\`vizardry
type: sipoc, flow
title: SIPOC Flow Diagram

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

link: Dev team -> Feature branch
link: Feature branch -> Build & test artefact
link: Build & test artefact -> Running service
link: Running service -> End users

link: CI/CD pipeline -> Test suite
link: Test suite -> Run test suite
link: Run test suite -> Deployment report
link: Deployment report -> On-call team

link: Cloud provider -> Docker image
link: Docker image -> Deploy to production
link: Deploy to production -> Alert rules
link: Alert rules -> Product owner
\`\`\`
`;

export const WARDLEY_TEMPLATE = `\`\`\`vizardry
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
\`\`\`
`;

export const ROADMAP_TEMPLATE = `\`\`\`vizardry
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
\`\`\`
`;

export const RACI_TEMPLATE = `\`\`\`vizardry
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

task: Test & sign off
  responsible: QA
  accountable: PM
  consulted: Developer
  informed: Stakeholder
\`\`\`
`;

export const CONCEPT_MAP_TEMPLATE = `\`\`\`vizardry
type: conceptmap
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

export const NODE_MAP_TEMPLATE = `\`\`\`vizardry
type: nodemap
title: Order Processing System

box: Customer [x: 40, y: 40, color: blue]
box: Order Service [x: 320, y: 40]
  Handles order creation
  and validation
box: Payment Gateway [x: 320, y: 220, color: green]

link: Customer -> Order Service : places order
link: Order Service -> Payment Gateway : charges card [color: green]
\`\`\`
`;

export const WHEEL_OF_LIFE_TEMPLATE = `\`\`\`vizardry
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
\`\`\`
`;

export const ODYSSEY_TEMPLATE = `\`\`\`vizardry
type: odyssey
title: Three Roads Forward

plan: A | The Steady Climb
  archetype: Current path, leveled up
  year 1: Ship the platform rewrite
  year 2: Lead a small team
  year 3: Move into product strategy
  year 5: Head of Product
  gauge: Resources | 8
  gauge: Likability | 6
  gauge: Confidence | 8
  gauge: Coherence | 6
  question: Do I actually want to manage people?
  question: Am I choosing this, or just drifting?

plan: B | Indie Maker
  archetype: The pivot
  year 1: Launch a paid side project
  year 3: Go full-time on my own product
  year 5: Sustainable one-person business
  gauge: Resources | 4
  gauge: Likability | 9
  gauge: Confidence | 4
  gauge: Coherence | 8
  question: How long can I fund the runway?

plan: C | Sail & Teach
  archetype: If money were no object
  year 1: Get sailing certified
  year 2: Buy a boat, learn to teach
  year 5: Run courses in the Med
  gauge: Resources | 2
  gauge: Likability | 10
  gauge: Confidence | 3
  gauge: Coherence | 5
  question: Is this escape, or a genuine calling?
\`\`\`
`;

export const PACE_LAYERS_TEMPLATE = `\`\`\`vizardry
// type: pacelayers, shearing | product | retro
type: pacelayers, shearing
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

export const MATRIX_PAIN_TEMPLATE = `\`\`\`vizardry
type: matrix, pain
title: Support Pain Points

item: Checkout fails on mobile at: t1
  Wallet payments rejected
item: Onboarding takes > 30 min at: t2
item: Stale search results at: t6
item: Favicon missing in Safari at: t16
\`\`\`
`;

export const MATRIX_OPP_TEMPLATE = `\`\`\`vizardry
type: matrix, opportunity
title: Roadmap Opportunities

item: Self-serve onboarding at: t1
  In-app sample project
item: Public API + webhooks at: t6
item: Quick-add from tray at: t11
\`\`\`
`;

export const MATRIX_IMPACT_TEMPLATE = `\`\`\`vizardry
type: matrix, impact
title: Q3 Prioritisation

item: Fix mobile checkout at: t1
  Wallet payments rejected
item: Saved filter presets at: t2
item: AI task summaries at: t7
item: On-prem deployment at: t16
item: Dark mode [0.28, 0.24]
\`\`\`
`;

export const MATRIX_ASSUMPTION_TEMPLATE = `\`\`\`vizardry
type: matrix, assumption
title: Riskiest Assumptions

item: Users will pay monthly at: t1
  No pricing tests yet
item: Buyers self-onboard at: t2
item: Prefer usage-based pricing at: t7
item: Want dark mode at: t13
\`\`\`
`;

export const MATRIX_SCENARIO_TEMPLATE = `\`\`\`vizardry
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
\`\`\`
`;

export const MATRIX_PLOT_TEMPLATE = `\`\`\`vizardry
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
\`\`\`
`;

export const SCQA_TEMPLATE = `\`\`\`vizardry
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
\`\`\`
`;

export const SCR_TEMPLATE = `\`\`\`vizardry
type: scr
title: SCR Narrative

situation: Checkout ran at 99.9% uptime all year
  complication: A config push took payments down for 40 minutes
    resolution: Add staged rollout with an automated config canary
  complication: On-call paging was delayed by 12 minutes
    resolution: Route payment alerts to a dedicated high-priority channel
\`\`\`
`;

export const JOURNEY_TEMPLATE = `\`\`\`vizardry
type: journey
title: Customer Journey Map

persona: Returning online shopper
scenario: Reordering a subscription item after a failed auto-renewal

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
  action: Compares subscription plans
  touchpoint: Order history screen
  feeling: Mildly annoyed | Extra steps to fix something automatic
  painpoint: No clear CTA to fix the payment method
  opportunity: Surface "Update payment method" inline on order history

phase: Resolution
  action: Updates card details
  action: Confirms reorder
  touchpoint: Payment settings screen
  feeling: Relieved | Glad it was quick once found
  opportunity: Auto-suggest reorder after a successful update
\`\`\`
`;

export const SERVICE_BLUEPRINT_TEMPLATE = `\`\`\`vizardry
type: journey, blueprint
title: Customer Journey Map — Subscription Recovery

persona: Returning online shopper
scenario: Reordering a subscription item after a failed auto-renewal

phase: Awareness
  action: Receives renewal-failed email
  touchpoint: Email notification
  feeling: Confused | Didn't expect the renewal to fail
  painpoint: Unclear why the renewal failed
  opportunity: Add a one-tap "retry payment" link in the email
  frontstage: Support chatbot greets user if they open live chat
  backstage: Billing service logs the failed charge
  support: Payment gateway webhook retry queue

phase: Consideration
  action: Opens order history
  touchpoint: Order history screen
  feeling: Mildly annoyed | Extra steps to fix something automatic
  frontstage: Agent reviews account on escalation
  backstage: CRM pulls billing history for agent view
  support: Customer data platform sync

phase: Resolution
  action: Updates card details
  touchpoint: Payment settings screen
  feeling: Relieved | Glad it was quick once found
  frontstage: Confirmation email sent by support team
  backstage: Billing service retries the charge
  support: Payment gateway processes the retry
\`\`\`
`;
