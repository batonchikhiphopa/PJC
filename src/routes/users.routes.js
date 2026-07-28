import { Router } from "express";
import bcrypt from "bcrypt";

import prisma from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { authRateLimit } from "../middleware/rate-limit.middleware.js";
import {
  validateBody,
  validateParams,
} from "../middleware/validate.middleware.js";
import {
  conflict,
  forbidden,
  notFound,
} from "../errors/app-error.js";
import {
  createUserSchema,
  idParamsSchema,
} from "../validation/schemas.js";

const router = Router();

router.post(
  "/",
  authRateLimit,
  validateBody(createUserSchema),
  async (req, res) => {
    const { email, password } = req.validatedBody;
    const existingUser = await prisma.user.findFirst({
      where: {
        email: {
          equals: email,
          mode: "insensitive",
        },
      },
      select: { id: true },
    });

    if (existingUser) {
      throw conflict("An account with this email already exists");
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
      },
      select: {
        id: true,
        email: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return res.status(201).json(user);
  },
);

router.get(
  "/:id",
  authMiddleware,
  validateParams(idParamsSchema),
  async (req, res) => {
    const { id } = req.validatedParams;

    if (req.user.userId !== id) {
      throw forbidden();
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw notFound("User not found");
    }

    return res.status(200).json(user);
  },
);

export default router;
