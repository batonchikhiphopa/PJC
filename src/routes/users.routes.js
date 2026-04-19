import { Router } from "express";
import prisma from "../lib/prisma.js";  
import bcrypt from "bcrypt";
import { authMiddleware } from "../middleware/auth.middleware.js";

const router = Router();

router.post("/", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (typeof email !== "string" || typeof password !== "string") {
      return res.status(400).json({
        error: "Email and password are required",
      });
    }

    const normalizedEmail = email.trim();

    if (!normalizedEmail || !password) {
      return res.status(400).json({
        error: "Email and password are required",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        password: hashedPassword,
      },
    });

    res.status(201).json({
      id: user.id,
      email: user.email,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
  } catch (error) {
    console.error("CREATE USER ERROR:", error);

    if (error.code === "P2002") {
      return res.status(409).json({
        error: "Email already exists",
      });
    }

    res.status(500).json({
      error: "Failed to create user",
      message: error.message,
    });
  }
});

router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (Number.isNaN(id)) {
      return res.status(400).json({
        error: "Invalid user id",
      });
    }

    if (req.user.userId !== id) {
      return res.status(403).json({
        error: "Forbidden",
      });
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
      return res.status(404).json({
        error: "User not found",
      });
    }

    res.status(200).json(user);
  } catch (error) {
    console.error("GET USER BY ID ERROR:", error);

    res.status(500).json({
      error: "Failed to fetch user",
      message: error.message,
    });
  }
});

export default router;