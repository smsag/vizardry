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
    { label: "Strengths",     area: "sw", placeholder: "What do you do well that others can't easily copy?" },
    { label: "Weaknesses",    area: "wk", placeholder: "Where are you genuinely behind — honest answer?" },
    { label: "Opportunities", area: "op", placeholder: "What external shifts could you act on right now?" },
    { label: "Threats",       area: "th", placeholder: "What would hurt you if you ignored it for six months?" },
  ],
};
