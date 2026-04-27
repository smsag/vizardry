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
    { key: "current_condition",  label: "Current Condition",  area: "cc" },
    { key: "target_condition",   label: "Target Condition",   area: "tc" },
    { key: "obstacles",          label: "Obstacles",          area: "ob" },
    { key: "next_experiment",    label: "Next Experiment",    area: "ne" },
    { key: "expected_outcome",   label: "Expected Outcome",   area: "eo" },
  ],
};
