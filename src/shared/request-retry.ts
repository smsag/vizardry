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
}

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

export async function withRetry429<T extends RetryableResponse>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? 2;
  const baseDelayMs = options.baseDelayMs ?? 500;

  for (let attempt = 0; ; attempt++) {
    const resp = await fn();
    if (resp.status !== 429 || attempt >= maxRetries) return resp;

    const retryAfter = parseRetryAfterMs(resp.headers?.["retry-after"] ?? resp.headers?.["Retry-After"]);
    await sleep(retryAfter ?? baseDelayMs * Math.pow(2, attempt));
  }
}
