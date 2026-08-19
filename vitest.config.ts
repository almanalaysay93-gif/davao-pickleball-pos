import { defineConfig } from "vitest/config";
import path from "path";

const templateRoot = path.resolve(import.meta.dirname);

export default defineConfig({
  root: templateRoot,
  resolve: {
    alias: {
      "@": path.resolve(templateRoot, "client", "src"),
      "@shared": path.resolve(templateRoot, "shared"),
      "@assets": path.resolve(templateRoot, "attached_assets"),
    },
  },
  test: {
    environment: "node",
    // Every file here talks to the same MySQL database, so running them at
    // once is not parallelism, it is two suites fighting over the same rows.
    // Court booking takes gap locks on bookings_court_day_idx and writes a
    // unique index on activeSlot, and concurrent files deadlock on them
    // (errno 1213). Serial is what the shared database was always worth.
    fileParallelism: false,
    include: ["server/**/*.test.ts", "server/**/*.spec.ts"],
    setupFiles: ["./vitest.setup.ts"],
  },
});
