import type { FrameworkDefinition } from "../types";

export const RAC: FrameworkDefinition = {
  id: "rac",
  label: "Riskiest Assumptions Canvas",
  gridTemplate: `
    "cu pr so"
    "mv co sc"
    "tr tr tr"
  `,
  gridColumns: "repeat(3, 1fr)",
  gridRows: "1fr 1fr auto",
  blocks: [
    { label: "Customers",                area: "cu", placeholder: "Who is your customer — and what do you assume about them?" },
    { label: "Problem",                  area: "pr", placeholder: "What problem do you assume they have — painful enough to pay to solve?" },
    { label: "Solution",                 area: "so", placeholder: "What solution do you assume will work — and why?" },
    { label: "MVP",                      area: "mv", placeholder: "What is the minimum you need to build to test the riskiest assumption?" },
    { label: "Competition",              area: "co", placeholder: "What are customers using today — why will they switch to you?" },
    { label: "Sales Channels",           area: "sc", placeholder: "How will you reach customers — and at what cost?" },
    { label: "Top Riskiest Assumptions", area: "tr", placeholder: "Which assumptions, if wrong, would kill this venture?" },
  ],
};
