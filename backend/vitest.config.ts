import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    // Run tests sequentially so the DB singleton doesn't get corrupted between files
    pool: "forks",
    // Each test file gets its own DB via env vars set in beforeEach
    testTimeout: 15000,
  },
});
