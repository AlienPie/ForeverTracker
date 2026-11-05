import { defineProject } from "vitest/config";

export default defineProject({ test: { name: "web", include: ["test/**/*.test.ts"], exclude: ["e2e/**", "node_modules/**"] } });
