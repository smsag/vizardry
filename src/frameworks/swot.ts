import type { FrameworkDefinition } from "../types";

export const SWOT: FrameworkDefinition = {
  id: "swot",
  label: "SWOT Analysis",
  gridTemplate: `
    "sw wk"
    "op th"
  `,
  gridColumns: "repeat(2, 1fr)",
  gridRows: "repeat(2, 1fr)",
  blocks: [
    { label: "Strengths",    area: "sw" },
    { label: "Weaknesses",   area: "wk" },
    { label: "Opportunities", area: "op" },
    { label: "Threats",      area: "th" },
  ],
};
