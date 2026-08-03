import { defineConfig } from "@playwright/test";

/**
 * Visual-regression config. Baselines are committed under
 * visual/visual.spec.ts-snapshots/ and are rendered by the Playwright-managed
 * Chromium — so CI must run in the matching Playwright container
 * (mcr.microsoft.com/playwright:v1.62.1-noble) for the snapshots to line up.
 * Regenerate with `npm run test:visual:update` in that same environment.
 */
export default defineConfig({
  testDir: "./visual",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? "line" : "list",
  expect: {
    // Absorb sub-pixel antialiasing noise while still catching real changes.
    toHaveScreenshot: { maxDiffPixelRatio: 0.02, animations: "disabled" },
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1280, height: 900 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 } } },
  ],
});
