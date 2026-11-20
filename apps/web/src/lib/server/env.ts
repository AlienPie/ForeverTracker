import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parseContentMode, type ContentMode } from "@ft/content";
import { parseTooltipProvider, type TooltipProvider } from "../links";

export interface Env {
  contentMode: ContentMode;
  /** Which third-party tooltip script the browser may load; "none" means no external requests. */
  tooltipProvider: TooltipProvider;
  /** Owner dashboard password; null when unset (owner login stays disabled). */
  ownerPassword: string | null;
  /** Secret for signing session cookies; null when unset. */
  sessionSecret: string | null;
  /**
   * Extra host names (no port, lower-cased) that open mode answers to besides
   * the loopback names; from the comma-separated ALLOWED_HOSTS.
   */
  allowedHosts: string[];
  /** Directory of the curated data files (CURATED_DIR; default: `data/curated` under the working directory). */
  curatedDir: string;
}

/**
 * The curated data directory: CURATED_DIR when set, else `<cwd>/data/curated`. When that does not exist
 * (running from `apps/web` in development) the nearest parent directory holding `data/curated` is used.
 */
export function resolveCuratedDir(configured: string | undefined, cwd: string = process.cwd()): string {
  if (configured) return resolve(cwd, configured);
  for (let dir = resolve(cwd); ; dir = dirname(dir)) {
    if (existsSync(join(dir, "data", "curated"))) return join(dir, "data", "curated");
    if (dirname(dir) === dir) break;
  }
  return join(resolve(cwd), "data", "curated");
}

const orNull = (v: string | undefined): string | null => (v ? v : null);

const hostList = (v: string | undefined): string[] =>
  (v ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter((h) => h !== "");

/** Read the environment once. Throws on an invalid value so a bad config stops the server at boot. */
export function readEnv(source: Record<string, string | undefined> = process.env): Env {
  let contentMode: ContentMode;
  try {
    contentMode = parseContentMode(source.CONTENT_MODE);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid CONTENT_MODE: ${detail}`);
  }
  const tooltipProvider = parseTooltipProvider(source.TOOLTIP_PROVIDER);
  return {
    contentMode,
    tooltipProvider,
    ownerPassword: orNull(source.OWNER_PASSWORD),
    sessionSecret: orNull(source.SESSION_SECRET),
    allowedHosts: hostList(source.ALLOWED_HOSTS),
    curatedDir: resolveCuratedDir(orNull(source.CURATED_DIR) ?? undefined),
  };
}

let cached: Env | undefined;
export function env(): Env {
  return (cached ??= readEnv());
}
