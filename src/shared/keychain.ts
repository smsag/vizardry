import type { App } from "obsidian";

export function saveSecret(app: App, name: string, value: string): void {
  app.secretStorage.setSecret(name, value);
}

export function loadSecret(app: App, name: string): string | null {
  return app.secretStorage.getSecret(name) ?? null;
}

export function listSecrets(app: App): string[] {
  return app.secretStorage.listSecrets();
}
