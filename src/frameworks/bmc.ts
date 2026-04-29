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
    { label: "Key Partners",             area: "kp" },
    { label: "Key Activities",           area: "ka" },
    { label: "Key Resources",            area: "kr" },
    { label: "Value Propositions",       area: "vp" },
    { label: "Customer Relationships",   area: "cr" },
    { label: "Channels",                 area: "ch" },
    { label: "Customer Segments",        area: "cs" },
    { label: "Cost Structure",           area: "co" },
    { label: "Revenue Streams",          area: "rr" },
  ],
};
