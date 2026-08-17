const STORAGE_KEY = "vzd-theme";

export function initTheme(): void {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "dark" || (!stored && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
    document.documentElement.classList.add("theme-dark");
  }
}

export function toggleTheme(): void {
  const isDark = document.documentElement.classList.toggle("theme-dark");
  localStorage.setItem(STORAGE_KEY, isDark ? "dark" : "light");
}
