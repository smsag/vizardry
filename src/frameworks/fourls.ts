import type { FrameworkDefinition } from "../types";

export const FOURLS: FrameworkDefinition = {
  id: "fourls",
  label: "4Ls Retrospective",
  gridTemplate: `"li le la lo"
    "ac ac ac ac"`,
  gridColumns: "repeat(4, 1fr)",
  gridRows: "1fr auto",
  blocks: [
    { label: "Liked",      area: "li" },
    { label: "Learned",    area: "le" },
    { label: "Lacked",     area: "la" },
    { label: "Longed For", area: "lo" },
    { label: "Actions",    area: "ac" },
  ],
};
