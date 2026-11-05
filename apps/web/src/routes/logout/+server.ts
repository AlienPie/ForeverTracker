import { redirect, type RequestHandler } from "@sveltejs/kit";
import { SESSION_COOKIE } from "../../lib/server/session";

// POST only: a GET (link prefetch, img tag) must never log the owner out.
export const POST: RequestHandler = ({ cookies }) => {
  cookies.delete(SESSION_COOKIE, { path: "/" });
  redirect(303, "/login");
};
