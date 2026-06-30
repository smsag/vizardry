/** Expanded FeedbackStatus object (returned when ?expand=status) */
export interface UpvotyStatus {
  id: string;
  label: string;
  color: string | null;
  icon: string | null;
}

/** Expanded User/author object (returned when ?expand=author) */
export interface UpvotyAuthor {
  id: string;
  name: string | null;
  avatar: string | null;
}

/** A single Upvoty feedback item as returned by GET /v1/feedback-items/{id}?expand=status,author */
export interface UpvotyPost {
  id: string;
  title: string;
  /** HTML string — strip tags before display */
  content: string | null;
  votes_count: number;
  /** Expanded status object (null if no status set) */
  status: UpvotyStatus | null;
  /** Expanded author object */
  author: UpvotyAuthor | null;
  updated_at: string;
}

/** Persisted summary cache entry (stored in data.json under "upvotyCache") */
export interface UpvotyCacheEntry {
  /** LLM-generated summary; empty string if not yet summarised */
  summary: string;
  /** `updated_at` from Upvoty at time of caching — used to detect stale entries */
  postUpdatedAt: string;
  /** Unix ms timestamp when the summary was generated */
  summarizedAt: number;
}
