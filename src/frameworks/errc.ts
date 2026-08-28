import type { FrameworkDefinition } from "../types";

// ── ERRC Grid / Four Actions Framework ────────────────────────────────────────
//
// The Blue Ocean Strategy "Four Actions Framework" (Kim & Mauborgne). Four moves
// that reconstruct buyer value and break the value–cost trade-off. The two
// left-column actions lower the cost side (Eliminate, Reduce); the two
// right-column actions lift the value side (Raise, Create).

export const ERRC: FrameworkDefinition = {
  id: "errc",
  label: "ERRC Grid",
  gridTemplate: `
    "el ra"
    "re cr"
  `,
  gridColumns: "repeat(2, 1fr)",
  gridRows: "repeat(2, 1fr)",
  blocks: [
    { label: "Eliminate", area: "el", placeholder: "Which factors the industry takes for granted should be eliminated?" },
    { label: "Raise",     area: "ra", placeholder: "Which factors should be raised well above the industry standard?" },
    { label: "Reduce",    area: "re", placeholder: "Which factors should be reduced well below the industry standard?" },
    { label: "Create",    area: "cr", placeholder: "Which factors should be created that the industry has never offered?" },
  ],
};
