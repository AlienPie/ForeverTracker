import type { Db } from "@ft/db";
import { IngestError, ingestSavedVariables } from "@ft/core";
import { LuaParseError } from "@ft/savedvars";
import { verifyDeviceToken } from "./tokens";

export const MAX_BODY_BYTES = 8 * 1024 * 1024;

const json = (body: unknown, status: number) => Response.json(body, { status });

function bearerToken(request: Request): string | null {
  const match = /^Bearer ([^\s]+)$/i.exec(request.headers.get("authorization") ?? "");
  return match ? match[1]! : null;
}

/** Read the body as text, aborting as soon as more than `max` bytes arrive. Null = too large. */
async function readCapped(request: Request, max: number): Promise<string | null> {
  const declared = request.headers.get("content-length");
  if (declared !== null && /^\d+$/.test(declared) && Number(declared) > max) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function handleIngest(db: Db, request: Request): Promise<Response> {
  try {
    const token = bearerToken(request);
    if (!token || !verifyDeviceToken(db, token)) return json({ error: "unauthorized" }, 401);

    const text = await readCapped(request, MAX_BODY_BYTES);
    if (text === null) return json({ error: "too_large" }, 413);

    try {
      return json(ingestSavedVariables(db, text), 200);
    } catch (err) {
      if (err instanceof LuaParseError) return json({ error: "parse", line: err.line, column: err.column }, 422);
      if (err instanceof IngestError) return json({ error: "ingest", message: err.message }, 422);
      throw err;
    }
  } catch {
    return json({ error: "internal" }, 500);
  }
}
