// Bundle the token CLIs (create/list/revoke) into standalone ESM files (used by the container image,
// which has no tsx). better-sqlite3 and drizzle-orm stay external (runtime node_modules).
// Usage: node scripts/bundle-token.mjs [create-token outfile]   (default: ./create-token.mjs)
// list-tokens.mjs and revoke-token.mjs are written next to it.
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";

const migrationsDir = fileURLToPath(new URL("../../../packages/db/drizzle", import.meta.url));
const createOut = resolve(process.argv[2] ?? "create-token.mjs");
const outdir = dirname(createOut);

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

const entries = [
  ["create-token.ts", createOut],
  ["list-tokens.ts", join(outdir, "list-tokens.mjs")],
  ["revoke-token.ts", join(outdir, "revoke-token.mjs")],
];

for (const [entry, outfile] of entries) {
  await build({
    entryPoints: [fileURLToPath(new URL(`./${entry}`, import.meta.url))],
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    external: ["better-sqlite3", "drizzle-orm", "drizzle-orm/*"],
    plugins: [pinDbMigrations],
    logLevel: "info",
  });
}
