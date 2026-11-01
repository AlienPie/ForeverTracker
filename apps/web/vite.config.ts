import adapter from "@sveltejs/adapter-node";
import { sveltekit } from "@sveltejs/kit/vite";
import { fileURLToPath, pathToFileURL } from "node:url";
import { defineConfig, type Plugin } from "vite";

const migrationsDir = fileURLToPath(new URL("../../packages/db/drizzle", import.meta.url));

/**
 * @ft/db locates its migrations relative to its own source file. Once bundled,
 * import.meta.url points into build/, so pin the folder to the workspace copy.
 */
function pinDbMigrations(): Plugin {
  return {
    name: "pin-db-migrations",
    enforce: "pre",
    transform(code, id) {
      if (!id.replace(/\\/g, "/").endsWith("/packages/db/src/client.ts")) return null;
      const from = 'new URL("../drizzle", import.meta.url)';
      if (!code.includes(from)) this.error("pin-db-migrations: expected migrations URL not found in @ft/db");
      return code.replace(from, `new URL(${JSON.stringify(pathToFileURL(migrationsDir + "/").href)})`);
    },
  };
}

export default defineConfig({
  plugins: [
    pinDbMigrations(),
    sveltekit({ adapter: adapter() }),
  ],
  ssr: { noExternal: [/^@ft\//], external: ["better-sqlite3"] },
});
