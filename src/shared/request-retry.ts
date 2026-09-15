/**
 * Retries a rate-limited (HTTP 429) request with backoff. Linear/Upvoty/LLM
 * popovers are opened on every hover/click and re-fetch on TTL expiry, so a
 * burst of interactions can trip a provider's rate limit; without this, that
 * surfaces as a hard error instead of quietly retrying once or twice.
 *
 * Only retries on 429 — any other status or a thrown network error is
 * returned/propagated immediately, since retrying those wouldn't help.
 */

export interface RetryOptions {
  /** Number of retry attempts after the first request. Default 2. */
  maxRetries?: number;
  /** Base delay (ms) for exponential backoff when no Retry-After header is present. Default 500. */
  baseDelayMs?: number;
  /** Ceiling on any single wait, Retry-After included. Default 5 000 ms. */
  maxDelayMs?: number;
  /** Add up to MAX_JITTER_MS of random jitter to each wait. Default true. */
  jitter?: boolean;
}

/** No single wait, whatever the server asked for, exceeds this. */
export const MAX_RETRY_DELAY_MS = 5_000;
/** Upper bound of the random jitter added to each wait. */
export const MAX_JITTER_MS = 250;

interface RetryableResponse {
  status: number;
  headers?: Record<string, string>;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Parses a Retry-After header's delay-seconds form. Returns null for the
 *  HTTP-date form or anything unparseable, so callers fall back to backoff. */
function parseRetryAfterMs(value: string | undefined): number | null {
  if (!value) return null;
  const seconds = Number(value.trim());
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : null;
}

/** HTTP header names are case-insensitive; transports disagree on the casing
 *  they hand back, so match on the lowercased name rather than guessing at
 *  two of the spellings. */
function headerValue(headers: Record<string, string> | undefined, name: string): string | undefined {
  if (!headers) return undefined;
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === name) return value;
  }
  return undefined;
}

export async function withRetry429<T extends RetryableResponse>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? 2;
  const baseDelayMs = options.baseDelayMs ?? 500;
  const maxDelayMs = options.maxDelayMs ?? MAX_RETRY_DELAY_MS;

  for (let attempt = 0; ; attempt++) {
    const resp = await fn();
    if (resp.status !== 429 || attempt >= maxRetries) return resp;

    const retryAfter = parseRetryAfterMs(headerValue(resp.headers, "retry-after"));
    // Retry-After is honoured but capped: providers routinely answer with 30
    // to 120 seconds, and a badge cannot sit on "Loading…" for that long. A
    // small random jitter keeps the many keys of one canvas, all rate-limited
    // together, from retrying in lock-step.
    const wanted = retryAfter ?? baseDelayMs * Math.pow(2, attempt);
    const jitter = options.jitter === false ? 0 : Math.random() * Math.min(baseDelayMs, MAX_JITTER_MS);
    await sleep(Math.min(wanted, maxDelayMs) + jitter);
  }
}
