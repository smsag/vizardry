import type { FrameworkDefinition } from "../types";

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
    { label: "Products & Services", area: "ps", placeholder: "Everything you offer — every product, service, or feature." },
    { label: "Pain Relievers",      area: "pr", placeholder: "How does your offer reduce specific customer pains?" },
    { label: "Gain Creators",       area: "gc", placeholder: "How does your offer create benefits customers actually want?" },
    { label: "Customer Jobs",       area: "cj", placeholder: "What are customers trying to get done — functional, social, emotional?" },
    { label: "Pains",               area: "pn", placeholder: "What frustrates customers before, during, or after the job?" },
    { label: "Gains",               area: "ga", placeholder: "What outcomes and benefits do customers want or expect?" },
  ],
};
