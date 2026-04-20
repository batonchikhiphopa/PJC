import { Router } from "express";
import prisma from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.middleware.js";

const router = Router();

router.post("/", authMiddleware, async (req, res) => {
  try {
    const { name, website, location } = req.body;

    if (typeof name !== "string") {
      return res.status(400).json({
        error: "Company name is required",
      });
    }

    const normalizedName = name.trim();

    if (!normalizedName) {
      return res.status(400).json({
        error: "Company name is required",
      });
    }

    if (website !== undefined && typeof website !== "string") {
      return res.status(400).json({
        error: "Website must be a string",
      });
    }

    if (location !== undefined && typeof location !== "string") {
      return res.status(400).json({
        error: "Location must be a string",
      });
    }

    const normalizedWebsite =
      website === undefined ? undefined : website.trim() || null;

    const normalizedLocation =
      location === undefined ? undefined : location.trim() || null;

    const company = await prisma.company.create({
      data: {
        name: normalizedName,
        website: normalizedWebsite,
        location: normalizedLocation,
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

router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const companyId = Number(req.params.id);

    if (Number.isNaN(companyId)) {
      return res.status(400).json({
        error: "Invalid company id",
      });
    }

    const company = await prisma.company.findFirst({
      where: {
        id: companyId,
        userId: req.user.userId,
      },
    });

    if (!company) {
      return res.status(404).json({
        error: "Company not found",
      });
    }

    return res.status(200).json(company);
  } catch (error) {
    console.error("GET COMPANY BY ID ERROR:", error);

    return res.status(500).json({
      error: "Failed to fetch company",
    });
  }
});

router.patch("/:id", authMiddleware, async (req, res) => {
  try {
    const companyId = Number(req.params.id);

    if (Number.isNaN(companyId)) {
      return res.status(400).json({
        error: "Invalid company id",
      });
    }

    const { name, website, location } = req.body;

    const data = {};

    if (name !== undefined) {
      if (typeof name !== "string") {
        return res.status(400).json({
          error: "Name must be a string",
        });
      }

      const normalizedName = name.trim();

      if (!normalizedName) {
        return res.status(400).json({
          error: "Company name cannot be empty",
        });
      }

      data.name = normalizedName;
    }

    if (website !== undefined) {
      if (typeof website !== "string") {
        return res.status(400).json({
          error: "Website must be a string",
        });
      }

      data.website = website.trim() || null;
    }

    if (location !== undefined) {
      if (typeof location !== "string") {
        return res.status(400).json({
          error: "Location must be a string",
        });
      }

      data.location = location.trim() || null;
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({
        error: "No fields to update",
      });
    }

    const company = await prisma.company.findFirst({
      where: {
        id: companyId,
        userId: req.user.userId,
      },
    });

    if (!company) {
      return res.status(404).json({
        error: "Company not found",
      });
    }

    const updatedCompany = await prisma.company.update({
      where: {
        id: companyId,
      },
      data,
    });

    return res.status(200).json(updatedCompany);
  } catch (error) {
    console.error("UPDATE COMPANY ERROR:", error);

    return res.status(500).json({
      error: "Failed to update company",
    });
  }
});

router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const companyId = Number(req.params.id);

    if (Number.isNaN(companyId)) {
      return res.status(400).json({
        error: "Invalid company id",
      });
    }

    const company = await prisma.company.findFirst({
      where: {
        id: companyId,
        userId: req.user.userId,
      },
    });

    if (!company) {
      return res.status(404).json({
        error: "Company not found",
      });
    }

    await prisma.company.delete({
      where: {
        id: companyId,
      },
    });

    return res.status(200).json({
      message: "Company deleted successfully",
    });
  } catch (error) {
    console.error("DELETE COMPANY ERROR:", error);

    return res.status(500).json({
      error: "Failed to delete company",
    });
  }
});

export default router;