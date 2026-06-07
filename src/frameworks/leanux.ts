import type { FrameworkDefinition } from "../types";

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
    { label: "Business Problem",                    area: "bp", placeholder: "What business outcome do you need to change — and in what direction?" },
    { label: "Business Outcomes",                   area: "bo", placeholder: "What results will tell you this worked for the business?" },
    { label: "Users",                               area: "us", placeholder: "Who are the real users — and what are they doing today?" },
    { label: "User Outcomes & Benefits",            area: "ub", placeholder: "What do users need to do differently for the business to succeed?" },
    { label: "Solutions",                           area: "so", placeholder: "What features or changes might drive those user outcomes?" },
    { label: "Hypotheses",                          area: "hy", placeholder: "If [solution], then [users] will [outcome], leading to [business result]." },
    { label: "Most Important Thing to Learn First", area: "ma", placeholder: "What is the riskiest assumption — what must be true for this to work?" },
    { label: "Minimum Experiment",                  area: "me", placeholder: "What is the smallest thing you can build or test to validate that?" },
  ],
};
