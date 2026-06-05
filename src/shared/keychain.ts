import type { App } from "obsidian";

/**
 * Thin wrappers around Obsidian's built-in `app.secretStorage`, which on
 * desktop delegates to the OS keychain (macOS Keychain, Windows Credential
 * Manager, Linux libsecret). Secret material never touches data.json or any
 * syncable file.
 *
 * The `name` parameter is a logical secret identifier (e.g. "vzd-linear-key").
 * Only this name is stored in PluginSettings / data.json — not the key itself.
 */

export async function saveSecret(app: App, name: string, value: string): Promise<void> {
  await app.secretStorage.setSecret(name, value);
}

export async function loadSecret(app: App, name: string): Promise<string | null> {
  const v = await app.secretStorage.getSecret(name);
  return v ?? null;
}

export async function deleteSecret(app: App, name: string): Promise<void> {
  await app.secretStorage.deleteSecret(name);
}

/**
 * One-time migration: wipe any remnants from the old Electron-safeStorage /
 * localStorage approach so stale blobs don't accumulate.
 *
 * Called from VizardryPlugin.onload() — safe to call even if keys never
 * existed (the calls are no-ops in that case).
 */
export function clearLegacyLocalStorageKeys(plugin: { saveLocalStorage(key: string, value: unknown): void }): void {
  for (const key of ["vzd-linear-key", "vzd-linear-key-enc", "vzd-llm-key", "vzd-llm-key-enc"]) {
    plugin.saveLocalStorage(key, null);
  }
}
