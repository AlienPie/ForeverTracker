import { parseContentMode, type ContentMode } from "@ft/content";

export interface Env {
  contentMode: ContentMode;
}

/** Read the environment once. No secrets are required at boot (and none are held here). */
export function readEnv(source: Record<string, string | undefined> = process.env): Env {
  return {
    contentMode: parseContentMode(source.CONTENT_MODE),
  };
}

let cached: Env | undefined;
export function env(): Env {
  return (cached ??= readEnv());
}
