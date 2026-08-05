import type { FrameworkDefinition } from "../types";

// Petra Wille's "Future Self" reflection canvas: describe where you are now
// (As-Is) and where you want to be (To-Be) over a set period, then the 1–5
// actions that bridge the gap. As-Is and To-Be stack in the left column; the
// Actions list spans the full height of the right column. The timeframe is a
// header field (see `periodField`).
export const FUTURE_SELF: FrameworkDefinition = {
  id: "futureself",
  label: "Future Self",
  gridTemplate: `
    "asis actions"
    "tobe actions"
  `,
  gridColumns: "repeat(2, 1fr)",
  gridRows: "repeat(2, 1fr)",
  periodField: true,
  blocks: [
    { label: "As-Is",   area: "asis",    cardBlock: true, placeholder: "Where you are now — a few honest bullets" },
    { label: "To-Be",   area: "tobe",    cardBlock: true, placeholder: "Where you want to be by the end of the period" },
    { label: "Actions", area: "actions", cardBlock: true, placeholder: "1–5 main points that bridge the gap" },
  ],
};
