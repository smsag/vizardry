import { FrameworkDefinition } from "../types";

export const LEANUX: FrameworkDefinition = {
  id: "leanux",
  label: "Lean UX Canvas",
  gridTemplate: `
    "bp bo us ub so"
    "hy hy ma me me"
  `,
  gridColumns: "repeat(5, 1fr)",
  gridRows: "1fr 1fr",
  blocks: [
    { key: "business_problem",           label: "Business Problem",                    area: "bp" },
    { key: "business_outcomes",          label: "Business Outcomes",                   area: "bo" },
    { key: "users",                      label: "Users",                               area: "us" },
    { key: "user_outcomes",              label: "User Outcomes & Benefits",            area: "ub" },
    { key: "solutions",                  label: "Solutions",                           area: "so" },
    { key: "hypotheses",                 label: "Hypotheses",                          area: "hy" },
    { key: "most_important_assumption",  label: "Most Important Thing to Learn First", area: "ma" },
    { key: "minimum_experiment",         label: "Minimum Experiment",                  area: "me" },
  ],
};
