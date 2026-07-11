import type { FrameworkDefinition } from "../types";

export const EXPERIMENT: FrameworkDefinition = {
  id: "experiment",
  label: "Experiment Canvas",
  gridTemplate: `
    "hy hy hy"
    "te me cr"
    "ob le de"
  `,
  gridColumns: "repeat(3, 1fr)",
  gridRows: "auto 1fr 1fr",
  blocks: [
    { label: "Hypothesis",        area: "hy", placeholder: "We believe that — what business assumption are you testing?" },
    { label: "Test",              area: "te", placeholder: "To verify that, we will — what will you actually do?" },
    { label: "Metric",            area: "me", placeholder: "And measure — what data point tells you the outcome?" },
    { label: "Success Criteria",  area: "cr", placeholder: "We are right if — what threshold confirms the hypothesis?" },
    { label: "Observation",       area: "ob", placeholder: "We observed — what actually happened when you ran the test?" },
    { label: "Learning",          area: "le", placeholder: "We learned — what insight follows from the observation?" },
    { label: "Decision",          area: "de", placeholder: "Therefore we will — persevere, pivot, or run another test?" },
  ],
};
