import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  resolve: {
    alias: {
      // Obsidian is only available at runtime inside the plugin host.
      // Point the import at a lightweight stub so renderer tests can run
      // in happy-dom without the full Obsidian environment.
      obsidian: resolve(__dirname, "src/__mocks__/obsidian.ts"),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    // Per-file environment overrides are declared with the
    // @vitest-environment happy-dom docblock annotation in each renderer test.
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      // Scope to production source only — exclude tests, mocks, and polyfills.
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/__mocks__/**",
        "src/test-setup.ts",
      ],
      // Thresholds reflect the reality that renderers require the Obsidian
      // runtime and cannot be fully exercised in unit tests. Parser and
      // shared-utility code is held to higher standards.
      thresholds: {
        statements: 58,
        branches:   54,
        functions:  44,
        lines:      60,
      },
    },
  },
});
