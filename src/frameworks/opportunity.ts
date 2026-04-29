import { FrameworkDefinition } from "../types";

export const OPPORTUNITY: FrameworkDefinition = {
  id: "opportunity",
  label: "Opportunity Canvas",
  gridTemplate: `
    "po si tu uo um"
    "bp bm bu af fs"
  `,
  gridColumns: "repeat(5, 1fr)",
  gridRows: "1fr 1fr",
  blocks: [
    { label: "Problem / Opportunity", area: "po" },
    { label: "Solution Ideas",        area: "si" },
    { label: "Target Users",          area: "tu" },
    { label: "User Outcomes",         area: "uo" },
    { label: "User Metrics",          area: "um" },
    { label: "Business Problem",      area: "bp" },
    { label: "Business Metrics",      area: "bm" },
    { label: "Budget",                area: "bu" },
    { label: "Adoption Factors",      area: "af" },
    { label: "Factors for Success",   area: "fs" },
  ],
};
