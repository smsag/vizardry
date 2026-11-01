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
  // The two axes SWOT is read along: what the item does for you, and where
  // it comes from.
  axes: { columns: ["Helpful", "Harmful"], rows: ["Internal", "External"] },
  blocks: [
    { label: "Strengths",     area: "sw", tone: "positive", placeholder: "What do you do well that others can't easily copy?" },
    { label: "Weaknesses",    area: "wk", tone: "negative", placeholder: "Where are you genuinely behind — honest answer?" },
    { label: "Opportunities", area: "op", tone: "positive", placeholder: "What external shifts could you act on right now?" },
    { label: "Threats",       area: "th", tone: "negative", placeholder: "What would hurt you if you ignored it for six months?" },
  ],
};
