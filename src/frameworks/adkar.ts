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
    { label: "Awareness", area: "aw" },
    { label: "Desire", area: "de" },
    { label: "Knowledge", area: "kn" },
    { label: "Ability", area: "ab" },
    { label: "Reinforcement", area: "re" },
  ],
};