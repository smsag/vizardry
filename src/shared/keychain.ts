import type { App } from "obsidian";

// NOTE: app.secretStorage methods are typed as synchronous (Obsidian 1.11.4+)
// but the mobile implementation (Capacitor-based) is truly async and may also
// throw on missing keys rather than returning null. Using async/await + try-catch
// handles all platforms safely.

export async function saveSecret(app: App, name: string, value: string): Promise<void> {
  if (!name || !app.secretStorage) return;
  try {
    await app.secretStorage.setSecret(name, value);
  } catch (err) {
    console.error("Vizardry: saveSecret failed", { name, err });
  }
}

export async function loadSecret(app: App, name: string): Promise<string | null> {
  if (!name || !app.secretStorage) return null;
  try {
    const value = await app.secretStorage.getSecret(name);
    // Guard against empty string — treat same as missing
    return (value != null && value !== "") ? value : null;
  } catch (err) {
    console.error("Vizardry: loadSecret failed", { name, err });
    return null;
  }
}

export function listSecrets(app: App): string[] {
  if (!app.secretStorage) return [];
  try {
    return app.secretStorage.listSecrets();
  } catch {
    return [];
  }
}
