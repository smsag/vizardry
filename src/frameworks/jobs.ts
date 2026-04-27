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
    { key: "job_performer",       label: "Job Performer",       area: "jp" },
    { key: "main_job",            label: "Main Job",            area: "mj" },
    { key: "circumstances",       label: "Circumstances",       area: "ci" },
    { key: "functional_aspects",  label: "Functional Aspects",  area: "fa" },
    { key: "emotional_aspects",   label: "Emotional Aspects",   area: "ea" },
    { key: "social_aspects",      label: "Social Aspects",      area: "sa" },
    { key: "current_solutions",   label: "Current Solutions",   area: "cs" },
    { key: "desired_outcomes",    label: "Desired Outcomes",    area: "ds" },
    { key: "obstacles",           label: "Obstacles",           area: "ob" },
  ],
};
