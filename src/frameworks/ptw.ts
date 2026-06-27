import type { FrameworkDefinition } from "../types";

export const PTW: FrameworkDefinition = {
  id: "ptw",
  label: "Playing to Win",
  gridTemplate: `
    "wa  wa  wa  si "
    "wtp htw htw re "
    "wtp cap cap re "
    "wtp sys sys re "
    "st  st  st  st "
  `,
  gridColumns: "1fr 1fr 1fr 1fr",
  gridRows: "auto 1fr 1fr 1fr auto",
  blocks: [
    {
      label: "Winning Aspiration",
      area: "wa",
      placeholder: "What does winning look like — for your customers, against your competition?\n\nExample: Be the most trusted project management tool for distributed engineering teams, winning on simplicity and time-to-value.",
    },
    {
      label: "Strategic Issue",
      area: "si",
      placeholder: "Why do we need a new strategy?\n\nExample: Growth has plateaued; competitors are gaining share in our core segment.",
    },
    {
      label: "Where To Play",
      area: "wtp",
      placeholder: "In which markets, segments, geographies, or channels do we compete? Where are we explicitly NOT playing?\n\nExample: B2B SaaS, mid-market engineering teams (20–200 devs), NA and EU, sold via product-led growth — not enterprise, not agencies.",
    },
    {
      label: "How To Win",
      area: "htw",
      placeholder: "What is our sustainable competitive advantage in the spaces we chose to play in? What differentiates us and provides superior value?\n\nExample: Fastest time-to-value through zero-config setup, native GitHub/Slack integrations, and a mobile-first experience no competitor matches.",
    },
    {
      label: "Capabilities Needed",
      area: "cap",
      placeholder: "What must consistently be performed at the highest level to achieve the advantage in each chosen space?\n\nExample: World-class onboarding UX. Real-time sync engine. Deep integration partnerships. Community-driven feature discovery.",
    },
    {
      label: "Systems Required",
      area: "sys",
      placeholder: "What management systems, processes, and structures must we have to sustain our capabilities and support our strategic choices?\n\nExample: Continuous discovery cadence. Integration marketplace governance. NPS OKR tied to exec compensation.",
    },
    {
      label: "Reverse Engineering",
      area: "re",
      placeholder: "What conditions must be true for this strategy to succeed?\n\nINDUSTRY\nThe market is large and growing enough to sustain a focused player.\n\nCUSTOMER VALUE\nCustomers value simplicity over feature breadth and will pay a premium for it.\n\nRELATIVE POSITION\nWe can build and sustain integration depth faster than competitors.\n\nCOMPETITIVE\nNetwork effects from our integration marketplace create a defensible moat.",
    },
    {
      label: "Strategic Tests",
      area: "st",
      placeholder: "For each condition above: What must be true? What is true today? How will we find out?\n\nExample: 'SMB teams pay a premium for simplicity' — must be true / not yet validated / run a pricing experiment with 3 cohorts this quarter.",
    },
  ],
};
