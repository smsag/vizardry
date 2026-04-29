import { FrameworkDefinition } from "../types";

export const JOBS: FrameworkDefinition = {
  id: "jobs",
  label: "Jobs Canvas",
  gridTemplate: `
    "jp mj ci"
    "fa ea sa"
    "cs ds ob"
  `,
  gridColumns: "repeat(3, 1fr)",
  gridRows: "repeat(3, 1fr)",
  blocks: [
    { label: "Job Performer",      area: "jp" },
    { label: "Main Job",           area: "mj" },
    { label: "Circumstances",      area: "ci" },
    { label: "Functional Aspects", area: "fa" },
    { label: "Emotional Aspects",  area: "ea" },
    { label: "Social Aspects",     area: "sa" },
    { label: "Current Solutions",  area: "cs" },
    { label: "Desired Outcomes",   area: "ds" },
    { label: "Obstacles",          area: "ob" },
  ],
};
