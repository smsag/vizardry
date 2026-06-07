export interface LinearState {
  name: string;
  /** Hex color string, e.g. "#4ea7fc" */
  color: string;
  /** Linear state type: "backlog" | "unstarted" | "started" | "completed" | "cancelled" */
  type: string;
}

export interface LinearComment {
  body: string;
  author: string;
}

export interface LinearIssue {
  key: string;
  title: string;
  description: string;
  state: LinearState;
  assignee: string | null;
  comments: LinearComment[];
  /** ISO 8601 timestamp of last update on Linear */
  updatedAt: string;
}

export interface CacheEntry {
  state: LinearState;
  /** LLM-generated summary; empty string if not yet summarised */
  summary: string;
  /** `updatedAt` from Linear at time of caching — used to detect stale entries */
  issueUpdatedAt: string;
  /** Unix ms timestamp when the summary was generated */
  summarizedAt: number;
}
