import type { App } from "obsidian";

// NOTE: app.secretStorage methods are typed as synchronous (Obsidian 1.11.4+)
// but may return Promises on mobile. Using async/await handles both.

export async function saveSecret(app: App, name: string, value: string): Promise<void> {
  await app.secretStorage.setSecret(name, value);
}

export async function loadSecret(app: App, name: string): Promise<string | null> {
  return (await app.secretStorage.getSecret(name)) ?? null;
}

export function listSecrets(app: App): string[] {
  return app.secretStorage.listSecrets();
}
