import { Router } from "express";
import prisma from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.middleware.js";

const router = Router();

router.post("/", authMiddleware, async (req, res) => {
  try {
    const { name, website, location } = req.body;

    if (!name) {
      return res.status(400).json({
        error: "Company name is required",
      });
    }

    const company = await prisma.company.create({
      data: {
        name,
        website,
        location,
        userId: req.user.userId,
      },
    });

    return res.status(201).json(company);
  } catch (error) {
    console.error("CREATE COMPANY ERROR:", error);

    return res.status(500).json({
      error: "Failed to create company",
    });
  }
});

router.get("/", authMiddleware, async (req, res) => {
  try {
    const companies = await prisma.company.findMany({
      where: {
        userId: req.user.userId,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return res.status(200).json(companies);
  } catch (error) {
    console.error("GET COMPANIES ERROR:", error);

    return res.status(500).json({
      error: "Failed to fetch companies",
    });
  }
});

export default router;