import type { Result } from "./core";

// ── Story Map ───────────────────────────────────────────────────────────────

export interface StoryTask {
  name: string;
  subtitle: string;
}

export interface StoryStep {
  name: string;
  tasks: StoryTask[];
}

export interface StoryActivity {
  name: string;
  steps: StoryStep[];
}

export interface StorySlice {
  name: string;
  // step name (lowercased) → task names (lowercased) assigned to this slice
  cells: Record<string, string[]>;
}

export interface StoryMap {
  user: string;
  goal: string;
  activities: StoryActivity[];
  slices: StorySlice[];
}

export type StoryMapResult = Result<StoryMap>;
