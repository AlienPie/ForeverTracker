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
  };
}

let cached: Env | undefined;
export function env(): Env {
  return (cached ??= readEnv());
}
