import type { Plugin } from "obsidian";

/**
 * Returns Electron's safeStorage module if available.
 * In Obsidian (nodeIntegration: true), `require('electron')` is accessible
 * from the renderer process. safeStorage encrypts values using the OS keychain
 * (macOS Schlüsselbund, Windows Credential Store, Linux libsecret).
 */
function getSafeStorage(): { isEncryptionAvailable(): boolean; encryptString(s: string): Buffer; decryptString(b: Buffer): string } | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const electron = (window as any).require?.("electron");
    if (electron?.safeStorage?.isEncryptionAvailable()) return electron.safeStorage;
  } catch {
    // safeStorage unavailable (mobile / web / test environment)
  }
  return null;
}

/**
 * Saves a secret using the OS keychain when available.
 * The encrypted blob is stored in Obsidian's vault-scoped localStorage under
 * `<key>-enc`. If encryption is unavailable (mobile, CI) it falls back to
 * plain localStorage under `<key>` — callers should warn the user in that case.
 *
 * Using `localStorage` rather than `data.json` keeps the secret out of any
 * file that could be accidentally synced or committed.
 */
export function saveSecret(plugin: Plugin, key: string, value: string): void {
  const ss = getSafeStorage();
  if (ss) {
    const enc = Buffer.from(ss.encryptString(value)).toString("base64");
    plugin.saveLocalStorage(`${key}-enc`, enc);
    plugin.saveLocalStorage(key, null); // clear any legacy plaintext
  } else {
    plugin.saveLocalStorage(key, value);
  }
}

/**
 * Loads a secret that was previously saved with `saveSecret`.
 * Tries the encrypted form first; falls back to legacy plaintext.
 */
export function loadSecret(plugin: Plugin, key: string): string | null {
  const ss = getSafeStorage();
  const enc = plugin.loadLocalStorage(`${key}-enc`) as string | null;
  if (enc && ss) {
    try {
      return ss.decryptString(Buffer.from(enc, "base64"));
    } catch {
      // decryption failed (key changed, corruption) — fall through
    }
  }
  return (plugin.loadLocalStorage(key) as string | null) ?? null;
}

/** Returns true when OS-level encryption is available. */
export function isKeychainAvailable(): boolean {
  return getSafeStorage() !== null;
}
