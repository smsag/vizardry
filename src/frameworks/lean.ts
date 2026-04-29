import { FrameworkDefinition } from "../types";

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
    { label: "Problem",                  area: "pr"  },
    { label: "Solution",                 area: "so"  },
    { label: "Unique Value Proposition", area: "uvp" },
    { label: "Unfair Advantage",         area: "ua"  },
    { label: "Customer Segments",        area: "cs"  },
    { label: "Key Metrics",              area: "km"  },
    { label: "Channels",                 area: "ca"  },
    { label: "Cost Structure",           area: "co"  },
    { label: "Revenue Streams",          area: "rr"  },
  ],
};
