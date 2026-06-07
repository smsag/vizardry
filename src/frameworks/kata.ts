import type { FrameworkDefinition } from "../types";

export const KATA: FrameworkDefinition = {
  id: "kata",
  label: "Product Kata",
  gridTemplate: `
    "cc tc"
    "ob ob"
    "ne eo"
  `,
  gridColumns: "repeat(2, 1fr)",
  gridRows: "1fr auto 1fr",
  blocks: [
    { label: "Current Condition", area: "cc", placeholder: "What is the measurable reality right now — not the target?" },
    { label: "Target Condition",  area: "tc", placeholder: "What specific state do you want to reach, and by when?" },
    { label: "Obstacles",         area: "ob", placeholder: "What is the one thing standing between current and target?" },
    { label: "Next Experiment",   area: "ne", placeholder: "What is the smallest test you can run to learn something?" },
    { label: "Expected Outcome",  area: "eo", placeholder: "What do you predict will happen — and how will you measure it?" },
  ],
};
