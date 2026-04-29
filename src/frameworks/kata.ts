import { FrameworkDefinition } from "../types";

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
    { label: "Current Condition", area: "cc" },
    { label: "Target Condition",  area: "tc" },
    { label: "Obstacles",         area: "ob" },
    { label: "Next Experiment",   area: "ne" },
    { label: "Expected Outcome",  area: "eo" },
  ],
};
