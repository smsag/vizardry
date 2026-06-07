import type { FrameworkDefinition } from "../types";

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
    { label: "Problem / Opportunity", area: "po", placeholder: "What problem does this solve — or what opportunity does it capture?" },
    { label: "Solution Ideas",        area: "si", placeholder: "What approaches might work — brainstorm before narrowing?" },
    { label: "Target Users",          area: "tu", placeholder: "Who would benefit — and what are they doing today?" },
    { label: "User Outcomes",         area: "uo", placeholder: "What will users do differently if this works?" },
    { label: "User Metrics",          area: "um", placeholder: "How will you measure the change in user behaviour?" },
    { label: "Business Problem",      area: "bp", placeholder: "What business challenge does this address — revenue, retention, scale?" },
    { label: "Business Metrics",      area: "bm", placeholder: "How will you know this worked for the business?" },
    { label: "Budget",                area: "bu", placeholder: "What resources are available — time, money, people?" },
    { label: "Adoption Factors",      area: "af", placeholder: "What needs to be true for users to adopt this?" },
    { label: "Factors for Success",   area: "fs", placeholder: "What does the business need in place to execute this well?" },
  ],
};
