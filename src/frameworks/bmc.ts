import type { FrameworkDefinition } from "../types";

export const BMC: FrameworkDefinition = {
  id: "bmc",
  label: "Business Model Canvas",
  gridTemplate: `
    "kp ka vp cr cs"
    "kp kr vp ch cs"
    "co co co rr rr"
  `,
  gridColumns: "repeat(5, 1fr)",
  gridRows: "1fr 1fr auto",
  blocks: [
    { label: "Key Partners",           area: "kp", placeholder: "Who do you rely on that you won't build or do yourself?" },
    { label: "Key Activities",         area: "ka", placeholder: "What must happen every day to deliver value?" },
    { label: "Key Resources",          area: "kr", placeholder: "What do you need to own, hire, or access to operate?" },
    { label: "Value Propositions",     area: "vp", placeholder: "What problem do you solve — and why you, not someone else?" },
    { label: "Customer Relationships", area: "cr", placeholder: "How do you acquire, keep, and grow customers?" },
    { label: "Channels",               area: "ch", placeholder: "How do customers find, buy, and receive your offer?" },
    { label: "Customer Segments",      area: "cs", placeholder: "Who is this for — and who is it explicitly not for?" },
    { label: "Cost Structure",         area: "co", placeholder: "What are your biggest costs to deliver and to scale?" },
    { label: "Revenue Streams",        area: "rr", placeholder: "How do customers pay — and what are they really buying?" },
  ],
};
