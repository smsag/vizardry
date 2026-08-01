// Keeps manifest.json and versions.json in sync with package.json on a bump.
//
// Run via the npm `version` lifecycle: `npm version <patch|minor|major>`
// updates package.json first, then invokes this script (which reads the new
// version from npm_package_version), so all three files move together and
// docs-check.sh never has a mismatch to catch.
//
//   npm version minor --no-git-tag-version   # bump the three files, no tag
//
// (--no-git-tag-version fits the PR-then-dispatch release flow: the release
// workflow creates the tag itself.)
import { readFileSync, writeFileSync } from "fs";

const targetVersion = process.env.npm_package_version;
if (!targetVersion) {
  console.error("version-bump: npm_package_version is not set — run via `npm version`.");
  process.exit(1);
}

// manifest.json — set the version, keep minAppVersion for the versions.json entry.
const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
manifest.version = targetVersion;
writeFileSync("manifest.json", JSON.stringify(manifest, null, 2) + "\n");

// versions.json — record which minAppVersion this plugin version needs.
const versions = JSON.parse(readFileSync("versions.json", "utf8"));
versions[targetVersion] = manifest.minAppVersion;
writeFileSync("versions.json", JSON.stringify(versions, null, 2) + "\n");

console.log(`version-bump: synced manifest.json + versions.json to v${targetVersion}`);
