import type { App } from "obsidian";

/**
 * Thin wrappers around Obsidian's built-in `app.secretStorage`.
 * On desktop this delegates to the OS keychain (macOS Keychain,
 * Windows Credential Manager, Linux libsecret). Secret material
 * never touches data.json or any syncable file.
 *
 * The `name` parameter is a logical secret identifier stored in
 * PluginSettings — only the name (not the value) is in data.json.
 */

export async function saveSecret(app: App, name: string, value: string): Promise<void> {
  await app.secretStorage.setSecret(name, value);
}

export async function loadSecret(app: App, name: string): Promise<string | null> {
  return (await app.secretStorage.getSecret(name)) ?? null;
}

