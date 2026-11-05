import { parseContentMode, type ContentMode } from "@ft/content";

export interface Env {
  contentMode: ContentMode;
  /** Owner dashboard password; null when unset (owner login stays disabled). */
  ownerPassword: string | null;
  /** Secret for signing session cookies; null when unset. */
  sessionSecret: string | null;
}

const orNull = (v: string | undefined): string | null => (v ? v : null);

/** Read the environment once. Throws on an invalid value so a bad config stops the server at boot. */
export function readEnv(source: Record<string, string | undefined> = process.env): Env {
  let contentMode: ContentMode;
  try {
    contentMode = parseContentMode(source.CONTENT_MODE);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid CONTENT_MODE: ${detail}`);
  }
  return {
    contentMode,
    ownerPassword: orNull(source.OWNER_PASSWORD),
    sessionSecret: orNull(source.SESSION_SECRET),
  };
}

let cached: Env | undefined;
export function env(): Env {
  return (cached ??= readEnv());
}
