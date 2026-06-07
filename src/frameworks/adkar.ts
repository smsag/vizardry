import type { FrameworkDefinition } from "../types";

export const ADKAR: FrameworkDefinition = {
  id: "adkar",
  label: "ADKAR Model",
  gridTemplate: `
    "aw"
    "de"
    "kn"
    "ab"
    "re"
  `,
  gridColumns: "1fr",
  gridRows: "repeat(5, 1fr)",
  blocks: [
    { label: "Awareness",     area: "aw", placeholder: "Do people understand why this change is necessary?" },
    { label: "Desire",        area: "de", placeholder: "Do people want to support this — or are they waiting it out?" },
    { label: "Knowledge",     area: "kn", placeholder: "Do people know what to do differently, step by step?" },
    { label: "Ability",       area: "ab", placeholder: "Can people actually perform the new behaviour when it counts?" },
    { label: "Reinforcement", area: "re", placeholder: "What prevents the change from sliding back to the old way?" },
  ],
};