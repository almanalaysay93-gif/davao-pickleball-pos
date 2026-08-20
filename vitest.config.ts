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
    // Refuse to run against the production Supabase project. See vitest.setup.ts.
    setupFiles: ["./vitest.setup.ts"],
    include: ["server/**/*.test.ts", "server/**/*.spec.ts"],
    // Tests share one live database (the test Supabase project, enforced in
    // vitest.setup.ts); run files sequentially to avoid cross-file mutation
    // interference.
    fileParallelism: false,
  },
});
