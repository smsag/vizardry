import type { FrameworkDefinition } from "../types";

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
    { label: "Job Performer",      area: "jp", placeholder: "Who is trying to get this done — describe the real person in context?" },
    { label: "Main Job",           area: "mj", placeholder: "What outcome are they ultimately trying to achieve?" },
    { label: "Circumstances",      area: "ci", placeholder: "When and where does this job arise — what triggers it?" },
    { label: "Functional Aspects", area: "fa", placeholder: "What does success look like in practical, measurable terms?" },
    { label: "Emotional Aspects",  area: "ea", placeholder: "How do they want to feel when the job is done?" },
    { label: "Social Aspects",     area: "sa", placeholder: "How do they want to be seen by others?" },
    { label: "Current Solutions",  area: "cs", placeholder: "What are they using today — including workarounds?" },
    { label: "Desired Outcomes",   area: "ds", placeholder: "What does 'good' look like in their own words?" },
    { label: "Obstacles",          area: "ob", placeholder: "What gets in the way of completing this job easily?" },
  ],
};
