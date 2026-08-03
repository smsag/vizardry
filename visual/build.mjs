// Bundles the visual-regression harness for the browser: aliases the `obsidian`
// import to the local shim and emits a classic (IIFE) script so index.html can
// load it over file:// with no module/CORS friction.
import esbuild from "esbuild";
import path from "path";
import { fileURLToPath } from "url";

const dir = path.dirname(fileURLToPath(import.meta.url));

await esbuild.build({
  entryPoints: [path.join(dir, "harness.ts")],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2018",
  outfile: path.join(dir, "dist", "harness.js"),
  logLevel: "info",
  alias: { obsidian: path.join(dir, "obsidian.shim.ts") },
});
