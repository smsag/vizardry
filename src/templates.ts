import { FrameworkDefinition } from "./types";

export function generateCanvasTemplate(framework: FrameworkDefinition): string {
  const blocks = framework.blocks.map(b => `block: ${b.label}\n  `).join("\n\n");
  return `\`\`\`${framework.id}\n${blocks}\n\`\`\`\n`;
}

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
