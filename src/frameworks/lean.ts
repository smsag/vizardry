import { FrameworkDefinition } from "../types";

export const LEAN: FrameworkDefinition = {
  id: "lean",
  label: "Lean Canvas",
  gridTemplate: `
    "pr so uvp ca cs"
    "pr so uvp ua cs"
    "co co km rr rr"
  `,
  gridColumns: "repeat(5, 1fr)",
  gridRows: "1fr 1fr auto",
  blocks: [
    { key: "problem",                 label: "Problem",                  area: "pr" },
    { key: "solution",                label: "Solution",                 area: "so" },
    { key: "unique_value_proposition", label: "Unique Value Proposition", area: "uvp" },
    { key: "unfair_advantage",        label: "Unfair Advantage",         area: "ua" },
    { key: "customer_segments",       label: "Customer Segments",        area: "cs" },
    { key: "key_metrics",             label: "Key Metrics",              area: "km" },
    { key: "channels",                label: "Channels",                 area: "ca" },
    { key: "cost_structure",          label: "Cost Structure",           area: "co" },
    { key: "revenue_streams",         label: "Revenue Streams",          area: "rr" },
  ],
};
