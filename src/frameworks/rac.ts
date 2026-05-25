import type { FrameworkDefinition } from "../types";

export const RAC: FrameworkDefinition = {
  id: "rac",
  label: "Riskiest Assumptions Canvas",
  description: "Biggest risks ranked for testing.",
  gridTemplate: `
    "cu pr so"
    "mv co sc"
    "tr tr tr"
  `,
  gridColumns: "repeat(3, 1fr)",
  gridRows: "1fr 1fr auto",
  blocks: [
    { label: "Customers",                area: "cu" },
    { label: "Problem",                  area: "pr" },
    { label: "Solution",                 area: "so" },
    { label: "MVP",                      area: "mv" },
    { label: "Competition",              area: "co" },
    { label: "Sales Channels",           area: "sc" },
    { label: "Top Riskiest Assumptions", area: "tr" },
  ],
};
