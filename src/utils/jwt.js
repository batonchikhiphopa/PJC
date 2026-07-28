import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export function signAuthToken(userId) {
  return jwt.sign({ userId }, env.JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: "7d",
  });
}

export function verifyAuthToken(token) {
  return jwt.verify(token, env.JWT_SECRET, {
    algorithms: ["HS256"],
  });
}
