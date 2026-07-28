import { Router } from "express";
import bcrypt from "bcrypt";

import prisma from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { authRateLimit } from "../middleware/rate-limit.middleware.js";
import { validateBody } from "../middleware/validate.middleware.js";
import { notFound, unauthorized } from "../errors/app-error.js";
import { clearSessionCookie, setSessionCookie } from "../utils/cookies.js";
import { signAuthToken } from "../utils/jwt.js";
import { loginSchema } from "../validation/schemas.js";

const router = Router();

router.post(
  "/login",
  authRateLimit,
  validateBody(loginSchema),
  async (req, res) => {
    const { email, password } = req.validatedBody;

    const user = await prisma.user.findFirst({
      where: {
        email: {
          equals: email,
          mode: "insensitive",
        },
      },
      select: {
        id: true,
        email: true,
        password: true,
      },
    });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      throw unauthorized("Invalid email or password");
    }

    const token = signAuthToken(user.id);
    setSessionCookie(res, token);

    return res.status(200).json({
      token,
      user: {
        id: user.id,
        email: user.email,
      },
    });
  },
);

router.post("/logout", (req, res) => {
  clearSessionCookie(res);
  return res.status(204).end();
});

router.get("/me", authMiddleware, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    select: {
      id: true,
      email: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!user) {
    clearSessionCookie(res);
    throw notFound("User not found");
  }

  return res.status(200).json(user);
});

export default router;
