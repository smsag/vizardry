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
backbone: Activity 1 | Activity 2 | Activity 3

slice: Slice 1
  Activity 1:
  Activity 2:

slice: Slice 2
  Activity 1:
  Activity 2:
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
