import { fail, type Actions } from "@sveltejs/kit";
import { IngestError, LuaParseError, ingestSavedVariables, type IngestSummary } from "@ft/core";
import { getDb } from "../../lib/server/db";
import { MAX_BODY_BYTES } from "../../lib/server/ingest-handler";

/** Same cap as the token API. */
const MAX_UPLOAD_BYTES = MAX_BODY_BYTES;

export const actions: Actions = {
  /**
   * Note: adapter-node's BODY_SIZE_LIMIT (8M) bounds the whole multipart request,
   * whose framing adds a little overhead, so a file just under 8 MB can be refused
   * by the adapter (a plain 413 error page) before it reaches this action. Files
   * above the cap that do reach us get the friendly message below.
   */
  default: async ({ request }) => {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return fail(400, { error: "Could not read the upload. Choose the file and try again." });
    }
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return fail(400, { error: "Choose your ForeverTracker.lua file first." });
    }
    // Check the size before reading any text.
    if (file.size > MAX_UPLOAD_BYTES) return fail(413, { error: "File too large (limit 8 MB)" });

    try {
      const text = new TextDecoder("utf-8").decode(await file.arrayBuffer());
      const summary: IngestSummary = ingestSavedVariables(getDb(), text);
      return { summary };
    } catch (err) {
      if (err instanceof LuaParseError || err instanceof IngestError) return fail(400, { error: err.message });
      console.error("upload failed:", err instanceof Error ? err.name : "unknown error"); // never log file contents
      return fail(500, { error: "Something went wrong while reading the file." });
    }
  },
};
