import type { FrameworkDefinition } from "./types";

export function generateCanvasTemplate(framework: FrameworkDefinition): string {
  const blocks = framework.blocks.map(b => `block: ${b.label}\n  `).join("\n\n");
  return `\`\`\`${framework.id}\n${blocks}\n\`\`\`\n`;
}

export const FISHBONE_TEMPLATE = `\`\`\`fishbone
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
goal:

actor:
  impact:
    deliverable:
\`\`\`
`;

export const STORY_MAP_TEMPLATE = `\`\`\`story
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
context:

layer: Fashion
  note:

layer: Commerce
  note:

layer: Infrastructure
  obs:
  feed:
  idea:

layer: Governance
  obs:
  feed:
  idea:

layer: Culture
  obs:
  feed:
  idea:

layer: Nature
  note:
\`\`\`
`;
