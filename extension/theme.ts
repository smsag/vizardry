const STORAGE_KEY = "vzd-theme";
const DARK_CLASS = "theme-dark";

/** localStorage throws when storage is disabled or the quota is exhausted;
 *  the theme is a convenience, never worth breaking the page over. */
function readStored(): string | null {
  try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
}

function writeStored(value: string): void {
  try { localStorage.setItem(STORAGE_KEY, value); } catch { /* ignore */ }
}

export function initTheme(): void {
  const stored = readStored();
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  if (stored === "dark" || (!stored && prefersDark)) {
    document.documentElement.classList.add(DARK_CLASS);
  }
}

export function toggleTheme(): void {
  const isDark = document.documentElement.classList.toggle(DARK_CLASS);
  writeStored(isDark ? "dark" : "light");
}
