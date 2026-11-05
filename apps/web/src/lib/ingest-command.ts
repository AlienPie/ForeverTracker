/**
 * The shell command Settings shows with a new device token. `/api/ingest` needs
 * a POST with `Content-Type: application/octet-stream`: curl's --data-binary
 * alone sends a form content type, which SvelteKit's CSRF check refuses (403).
 * The token stays in $TOKEN, out of the URL and the shell history line.
 */
export function ingestCommand(origin: string): string {
  return `TOKEN='paste the token here'
curl -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/octet-stream' \\
  --data-binary @ForeverTracker.lua '${origin}/api/ingest'`;
}
