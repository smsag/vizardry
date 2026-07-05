// Holds the plugin version for error/log labeling. Kept as a plain module
// constant (rather than read from document.body.dataset) so it resolves
// correctly regardless of which Obsidian window (main or pop-out) triggered
// the log — the dataset attribute is only ever stamped on the main window's
// document.
let pluginVersion = "?";

export function setPluginVersion(v: string): void {
  pluginVersion = v;
}

export function getPluginVersion(): string {
  return pluginVersion;
}
