/**
 * Typed errors shared by the integration clients, so the services can decide
 * what to show by `instanceof` rather than by matching English substrings in
 * a message (which the LLM client never even produced, so an AI auth failure
 * raised no notice at all).
 */

/** The remote service rejected the credential (401/403). */
export class IntegrationAuthError extends Error {
  constructor(service: string) {
    super(`${service}: invalid or missing API key`);
    this.name = "IntegrationAuthError";
  }
}
