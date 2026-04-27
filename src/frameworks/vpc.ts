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
    { key: "products_services",  label: "Products & Services",  area: "ps" },
    { key: "pain_relievers",     label: "Pain Relievers",       area: "pr" },
    { key: "gain_creators",      label: "Gain Creators",        area: "gc" },
    { key: "customer_jobs",      label: "Customer Jobs",        area: "cj" },
    { key: "pains",              label: "Pains",                area: "pn" },
    { key: "gains",              label: "Gains",                area: "ga" },
  ],
};
