import { FrameworkDefinition } from "../types";

export const OST: FrameworkDefinition = {
  id: "ost",
  label: "Opportunity Solution Tree",
  gridTemplate: `
    "do do"
    "op op"
    "so so"
    "ex ex"
    "as as"
  `,
  gridColumns: "1fr",
  gridRows: "auto auto auto auto auto",
  blocks: [
    { label: "Desired Outcome", area: "do" },
    { label: "Opportunities", area: "op" },
    { label: "Solutions", area: "so" },
    { label: "Experiments", area: "ex" },
    { label: "Assumptions", area: "as" },
  ],
};
