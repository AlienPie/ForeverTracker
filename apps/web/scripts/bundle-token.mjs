// Bundle scripts/create-token.ts into one standalone ESM file (used by the container image,
// which has no tsx). better-sqlite3 and drizzle-orm stay external (runtime node_modules).
// Usage: node scripts/bundle-token.mjs [outfile]   (default: ./create-token.mjs)
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";

const migrationsDir = fileURLToPath(new URL("../../../packages/db/drizzle", import.meta.url));
const outfile = resolve(process.argv[2] ?? "create-token.mjs");

// Same pin as the vite plugin in vite.config.ts: @ft/db finds its migrations relative to its
// own source file, which no longer exists once bundled.
const pinDbMigrations = {
  name: "pin-db-migrations",
  setup(b) {
    b.onLoad({ filter: /packages[\\/]db[\\/]src[\\/]client\.ts$/ }, (args) => {
      const code = readFileSync(args.path, "utf8");
      const from = 'new URL("../drizzle", import.meta.url)';
      if (!code.includes(from)) throw new Error("pin-db-migrations: expected migrations URL not found in @ft/db");
      const to = `new URL(${JSON.stringify(pathToFileURL(migrationsDir + "/").href)})`;
      return { contents: code.replace(from, to), loader: "ts" };
    });
  },
};

await build({
  entryPoints: [fileURLToPath(new URL("./create-token.ts", import.meta.url))],
  outfile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  external: ["better-sqlite3", "drizzle-orm", "drizzle-orm/*"],
  plugins: [pinDbMigrations],
  logLevel: "info",
});
