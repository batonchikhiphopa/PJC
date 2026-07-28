import { Router } from "express";

import prisma from "../lib/prisma.js";

const router = Router();

router.get("/", (req, res) => {
  return res.status(200).json({
    status: "ok",
  });
});

router.get("/db", async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;

    return res.status(200).json({
      status: "ok",
      database: "connected",
    });
  } catch {
    return res.status(503).json({
      status: "error",
      database: "unavailable",
    });
  }
});

export default router;
