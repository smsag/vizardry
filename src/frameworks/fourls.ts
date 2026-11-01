import type { FrameworkDefinition } from "../types";

export const FOURLS: FrameworkDefinition = {
  id: "fourls",
  label: "4Ls Retrospective",
  gridTemplate: `"li le la lo"
    "ac ac ac ac"`,
  gridColumns: "repeat(4, 1fr)",
  gridRows: "1fr auto",
  blocks: [
    { label: "Liked",      area: "li", tone: "positive", placeholder: "What worked well enough to keep doing?" },
    { label: "Learned",    area: "le", tone: "info", placeholder: "What insight will change how you work next time?" },
    { label: "Lacked",     area: "la", tone: "negative", placeholder: "What was missing that held the team back?" },
    { label: "Longed For", area: "lo", tone: "caution", placeholder: "What do you wish existed — a process, tool, or agreement?" },
    { label: "Actions",    area: "ac", tone: "accent", placeholder: "What specific change will you make before the next retro?" },
  ],
};
