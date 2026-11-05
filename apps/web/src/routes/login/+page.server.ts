import { fail, redirect, type Actions, type ServerLoad } from "@sveltejs/kit";
import { env } from "../../lib/server/env";
import { SESSION_COOKIE, SESSION_MAX_AGE_S, checkPassword, safeNext, signSession } from "../../lib/server/session";

export const load: ServerLoad = ({ url }) => ({ next: safeNext(url.searchParams.get("next")) });

export const actions: Actions = {
  default: async ({ request, cookies, url }) => {
    const { ownerPassword, sessionSecret } = env();
    const form = await request.formData();
    const given = form.get("password");
    const next = safeNext(String(form.get("next") ?? url.searchParams.get("next") ?? ""));
    if (ownerPassword === null || sessionSecret === null) redirect(303, next); // open mode: nothing to log in to
    if (typeof given !== "string" || !checkPassword(ownerPassword, given)) {
      return fail(400, { error: "Wrong password", next });
    }
    cookies.set(SESSION_COOKIE, signSession(sessionSecret), {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: false, // plain HTTP on loopback
      maxAge: SESSION_MAX_AGE_S,
    });
    redirect(303, next);
  },
};
