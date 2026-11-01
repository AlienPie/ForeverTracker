import { getDb } from "$lib/server/db";
import { handleIngest } from "$lib/server/ingest-handler";

export const POST = ({ request }: { request: Request }) => handleIngest(getDb(), request);
