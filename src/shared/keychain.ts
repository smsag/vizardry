import type { App } from "obsidian";

// NOTE: app.secretStorage methods are typed as synchronous (Obsidian 1.11.4+)
// but the mobile implementation (Capacitor-based) is truly async and may also
// throw on missing keys rather than returning null. Using async/await + try-catch
// handles all platforms safely — listSecrets included, which is why it is async
// here despite the typings: awaiting an array is harmless, awaiting a promise
// the typings claim is an array is the difference between a populated picker
// and an empty one.

/**
 * Obsidian's own rule for a secret id, quoted from the SecretStorage API docs:
 * "Lowercase alphanumeric ID with optional dashes". `setSecret` throws on
 * anything else, so a name that fails this can never be stored — checking up
 * front lets the UI say why instead of leaving the rejection in the console.
 */
export const SECRET_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidSecretId(name: string): boolean {
  return SECRET_ID_PATTERN.test(name);
}

export type SaveSecretResult =
  | { ok: true }
  | { ok: false; reason: "invalid-name" | "unavailable" | "write-failed" };

/**
 * Writes a secret, reporting why it failed rather than swallowing it. A
 * rejected write used to be indistinguishable from a successful one until the
 * badge refreshed — the caller is expected to surface `reason` to the user.
 */
export async function saveSecret(app: App, name: string, value: string): Promise<SaveSecretResult> {
  if (!isValidSecretId(name)) return { ok: false, reason: "invalid-name" };
  if (!app.secretStorage) return { ok: false, reason: "unavailable" };
  try {
    await app.secretStorage.setSecret(name, value);
    return { ok: true };
  } catch (err) {
    console.error("Vizardry: saveSecret failed", { name, err });
    return { ok: false, reason: "write-failed" };
  }
}

export async function loadSecret(app: App, name: string): Promise<string | null> {
  if (!name || !app.secretStorage) return null;
  try {
    const value = await app.secretStorage.getSecret(name);
    // Guard against empty string — treat same as missing
    return (value !== null && value !== undefined && value !== "") ? value : null;
  } catch (err) {
    console.error("Vizardry: loadSecret failed", { name, err });
    return null;
  }
}

export async function listSecrets(app: App): Promise<string[]> {
  if (!app.secretStorage) return [];
  try {
    const names = await app.secretStorage.listSecrets();
    return Array.isArray(names) ? names : [];
  } catch (err) {
    // An empty picker with no trace anywhere is indistinguishable from an
    // empty keychain; leave a line for the person debugging it.
    console.warn("Vizardry: listing secrets failed", err);
    return [];
  }
}

/**
 * What a stored secret *name* currently resolves to. The plugin persists only
 * the name; the value lives in Obsidian's keychain, so a link can dangle
 * silently when the secret is renamed or deleted there. Distinguishing these
 * states is what stops a dangling link from reading as "never configured".
 */
export type SecretLinkState = "found" | "empty" | "missing" | "invalid" | "unavailable";

export async function secretLinkState(app: App, name: string): Promise<SecretLinkState> {
  if (!isValidSecretId(name)) return "invalid";
  if (!app.secretStorage) return "unavailable";
  if (await loadSecret(app, name)) return "found";
  // No value: either nothing is stored under this name at all (a dangling
  // link) or the entry exists but is blank. Only the listing can tell them
  // apart, and only the first is the user's cue to re-link.
  const names = await listSecrets(app);
  return names.includes(name) ? "empty" : "missing";
}
