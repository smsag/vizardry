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
    { key: "problem_opportunity",  label: "Problem / Opportunity",  area: "po" },
    { key: "solution_ideas",       label: "Solution Ideas",         area: "si" },
    { key: "target_users",         label: "Target Users",           area: "tu" },
    { key: "user_outcomes",        label: "User Outcomes",          area: "uo" },
    { key: "user_metrics",         label: "User Metrics",           area: "um" },
    { key: "business_problem",     label: "Business Problem",       area: "bp" },
    { key: "business_metrics",     label: "Business Metrics",       area: "bm" },
    { key: "budget",               label: "Budget",                 area: "bu" },
    { key: "adoption_factors",     label: "Adoption Factors",       area: "af" },
    { key: "factors_for_success",  label: "Factors for Success",    area: "fs" },
  ],
};
