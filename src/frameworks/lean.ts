import type { FrameworkDefinition } from "../types";

export const LEAN: FrameworkDefinition = {
  id: "lean",
  label: "Lean Canvas",
  gridTemplate: `
    "pr so uvp ca cs"
    "pr so uvp ua cs"
    "co co km rr rr"
  `,
  gridColumns: "repeat(5, 1fr)",
  gridRows: "1fr 1fr auto",
  blocks: [
    { label: "Problem",                  area: "pr",  placeholder: "What are the top 1–3 problems your early adopters have?" },
    { label: "Solution",                 area: "so",  placeholder: "What is the simplest version of your solution?" },
    { label: "Unique Value Proposition", area: "uvp", placeholder: "Why should someone choose you — one clear sentence?" },
    { label: "Unfair Advantage",         area: "ua",  placeholder: "What do you have that cannot be easily copied or bought?" },
    { label: "Customer Segments",        area: "cs",  placeholder: "Who are the early adopters — specific people, not everyone?" },
    { label: "Key Metrics",              area: "km",  placeholder: "What one number tells you this is working?" },
    { label: "Channels",                 area: "ca",  placeholder: "How do you reach customers — what is your fastest path to revenue?" },
    { label: "Cost Structure",           area: "co",  placeholder: "What does it cost to deliver value and acquire each customer?" },
    { label: "Revenue Streams",          area: "rr",  placeholder: "How much will you charge — and why will customers pay that?" },
  ],
};
