import { env } from "../config/env.js";

const sevenDaysInMilliseconds = 7 * 24 * 60 * 60 * 1000;

function baseCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "strict",
    secure: env.NODE_ENV === "production",
    path: "/",
  };
}

export function setSessionCookie(res, token) {
  res.cookie(env.SESSION_COOKIE_NAME, token, {
    ...baseCookieOptions(),
    maxAge: sevenDaysInMilliseconds,
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(env.SESSION_COOKIE_NAME, baseCookieOptions());
}
