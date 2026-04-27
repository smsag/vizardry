import { FrameworkDefinition } from "./types";

export function generateCanvasTemplate(framework: FrameworkDefinition): string {
  const keys = framework.blocks.map(b => `${b.key}: `).join("\n");
  return `\`\`\`${framework.id}\n${keys}\n\`\`\``;
}

export const IMPACT_MAP_TEMPLATE = `\`\`\`impact
goal:

actor:
  impact:
    deliverable:
\`\`\``;
