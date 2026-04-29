import { FrameworkDefinition } from "../types";

export const VPC: FrameworkDefinition = {
  id: "vpc",
  label: "Value Proposition Canvas",
  gridTemplate: `
    "ps cj"
    "pr pn"
    "gc ga"
  `,
  gridColumns: "repeat(2, 1fr)",
  gridRows: "repeat(3, 1fr)",
  blocks: [
    { label: "Products & Services", area: "ps" },
    { label: "Pain Relievers",      area: "pr" },
    { label: "Gain Creators",       area: "gc" },
    { label: "Customer Jobs",       area: "cj" },
    { label: "Pains",               area: "pn" },
    { label: "Gains",               area: "ga" },
  ],
};
