import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineProject } from "vitest/config";

// The svelte plugin lets tests server-render components (svelte/server) to assert markup.
export default defineProject({
  plugins: [svelte()],
  test: { name: "web", include: ["test/**/*.test.ts"], exclude: ["e2e/**", "node_modules/**"] },
});
