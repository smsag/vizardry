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
    { label: "Business Problem",                    area: "bp" },
    { label: "Business Outcomes",                   area: "bo" },
    { label: "Users",                               area: "us" },
    { label: "User Outcomes & Benefits",            area: "ub" },
    { label: "Solutions",                           area: "so" },
    { label: "Hypotheses",                          area: "hy" },
    { label: "Most Important Thing to Learn First", area: "ma" },
    { label: "Minimum Experiment",                  area: "me" },
  ],
};
