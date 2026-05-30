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
  },
});
