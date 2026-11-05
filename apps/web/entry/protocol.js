// Copied next to the server entry by `pnpm --filter web build` (see index.js).

/**
 * Name of the header adapter-node reads the request protocol from. Defaults
 * PROTOCOL_HEADER to x-forwarded-proto (written back so adapter-node sees it).
 * @param {Record<string, string | undefined>} env
 * @returns {string} the header name, lowercased
 */
export function protocolHeader(env) {
  if (!env.PROTOCOL_HEADER) env.PROTOCOL_HEADER = "x-forwarded-proto";
  return env.PROTOCOL_HEADER.toLowerCase();
}

/**
 * This server only listens on plain HTTP, so a request that arrives without a
 * proxy's protocol header really was plain HTTP: say so. A proxy's value
 * (e.g. "https") is left alone.
 * @param {Record<string, string | string[] | undefined>} headers
 * @param {string} name lowercased header name
 */
export function markPlainHttp(headers, name) {
  if (!headers[name]) headers[name] = "http";
}
