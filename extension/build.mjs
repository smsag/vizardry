import esbuild from "esbuild";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(dir);
const prod = process.argv[2] === "production";

await esbuild.build({
  entryPoints: [
    path.join(dir, "viewer.ts"),
    path.join(dir, "popup.ts"),
  ],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2020",
  outdir: path.join(dir, "dist"),
  alias: { obsidian: path.join(dir, "obsidian.shim.ts") },
  minify: prod,
  sourcemap: prod ? false : "inline",
  logLevel: "info",
});

// Copy styles.css into the extension directory so the extension is self-contained.
fs.copyFileSync(path.join(root, "styles.css"), path.join(dir, "styles.css"));

// The library build (extension/library.ts): one script with the global
// `Vizardry` and one stylesheet, for pages outside Obsidian. Always minified
// and without a source map: it is vendored into other apps as is.
const version = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8")).version;
await esbuild.build({
  entryPoints: [path.join(dir, "library.ts")],
  bundle: true,
  format: "iife",
  globalName: "Vizardry",
  platform: "browser",
  target: "es2020",
  outfile: path.join(dir, "dist", "vizardry.js"),
  alias: { obsidian: path.join(dir, "obsidian.shim.ts") },
  define: { __VIZARDRY_VERSION__: JSON.stringify(version) },
  banner: { js: `/* Vizardry ${version} — MIT License, https://github.com/smsag/vizardry */` },
  minify: true,
  logLevel: "info",
});
fs.writeFileSync(
  path.join(dir, "dist", "vizardry.css"),
  `/* Vizardry ${version} — MIT License, https://github.com/smsag/vizardry */\n`
    + fs.readFileSync(path.join(dir, "theme.css"), "utf8") + "\n"
    + fs.readFileSync(path.join(root, "styles.css"), "utf8"),
);
