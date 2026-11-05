// Server entry, copied to build/index.js by `pnpm --filter web build`; the
// SvelteKit app itself is built to build/app/. Start with `node build`.
//
// adapter-node takes the request protocol from PROTOCOL_HEADER and otherwise
// assumes https, so a browser on http://localhost:3000 sends
// `Origin: http://localhost:3000` while SvelteKit thinks it is
// https://localhost:3000, and its CSRF check rejects every form POST (login,
// sign out) with 403. Fill the protocol header with "http" for requests that
// reach this plain-HTTP listener directly; a TLS reverse proxy's
// x-forwarded-proto is kept. The CSRF origin check itself stays on.
import process from "node:process";
import { markPlainHttp, protocolHeader } from "./protocol.js";

const header = protocolHeader(process.env); // before adapter-node reads its env
const { server } = await import("./app/index.js");
server.prependListener("request", (req) => markPlainHttp(req.headers, header));
