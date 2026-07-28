import { env } from "../config/env.js";
import { unauthorized } from "../errors/app-error.js";
import { clearSessionCookie } from "../utils/cookies.js";
import { verifyAuthToken } from "../utils/jwt.js";

export function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  let token = req.cookies?.[env.SESSION_COOKIE_NAME];
  let tokenSource = token ? "cookie" : null;

  if (authHeader) {
    const [type, bearerToken, ...extraParts] = authHeader.split(" ");

    if (type !== "Bearer" || !bearerToken || extraParts.length > 0) {
      return next(unauthorized("Invalid authorization format"));
    }

    token = bearerToken;
    tokenSource = "header";
  }

  if (!token) {
    return next(unauthorized());
  }

  try {
    const decoded = verifyAuthToken(token);

    if (
      typeof decoded !== "object" ||
      !Number.isInteger(decoded.userId) ||
      decoded.userId <= 0
    ) {
      throw new Error("Token payload is invalid");
    }

    req.user = { userId: decoded.userId };

    return next();
  } catch (error) {
    if (tokenSource === "cookie") {
      clearSessionCookie(res);
    }

    return next(unauthorized("Invalid or expired session"));
  }
}
