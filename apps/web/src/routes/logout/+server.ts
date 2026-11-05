import { redirect, type RequestHandler } from "@sveltejs/kit";
import { SESSION_COOKIE } from "../../lib/server/session";

// POST only: a GET (link prefetch, img tag) must never log the owner out.
export const POST: RequestHandler = ({ cookies }) => {
  // Match the login cookie (secure: false): a Secure deletion cookie is ignored over plain HTTP.
  cookies.delete(SESSION_COOKIE, { path: "/", secure: false });
  redirect(303, "/login");
};
