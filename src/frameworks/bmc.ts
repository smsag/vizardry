import { FrameworkDefinition } from "../types";

export const BMC: FrameworkDefinition = {
  id: "bmc",
  label: "Business Model Canvas",
  gridTemplate: `
    "kp ka vp cr cs"
    "kp kr vp ch cs"
    "co co co rr rr"
  `,
  gridColumns: "repeat(5, 1fr)",
  gridRows: "1fr 1fr auto",
  blocks: [
    { key: "key_partners",         label: "Key Partners",         area: "kp" },
    { key: "key_activities",       label: "Key Activities",       area: "ka" },
    { key: "key_resources",        label: "Key Resources",        area: "kr" },
    { key: "value_propositions",   label: "Value Propositions",   area: "vp" },
    { key: "customer_relationships", label: "Customer Relationships", area: "cr" },
    { key: "channels",             label: "Channels",             area: "ch" },
    { key: "customer_segments",    label: "Customer Segments",    area: "cs" },
    { key: "cost_structure",       label: "Cost Structure",       area: "co" },
    { key: "revenue_streams",      label: "Revenue Streams",      area: "rr" },
  ],
};
