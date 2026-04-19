import { Router } from "express";
import prisma from "../lib/prisma.js";

const router = Router();

router.get("/", (req, res) => {
  res.status(200).json({
    status: "ok",
  });
});
router.get("/db", async (req, res) => {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  res.json(users);
});

export default router;