import { Router } from "express";

import prisma from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import {
  validateBody,
  validateParams,
} from "../middleware/validate.middleware.js";
import { conflict, notFound } from "../errors/app-error.js";
import {
  createCompanySchema,
  idParamsSchema,
  updateCompanySchema,
} from "../validation/schemas.js";

const router = Router();

router.use(authMiddleware);

router.post("/", validateBody(createCompanySchema), async (req, res) => {
  const company = await prisma.company.create({
    data: {
      ...req.validatedBody,
      userId: req.user.userId,
    },
  });

  return res.status(201).json(company);
});

router.get("/", async (req, res) => {
  const companies = await prisma.company.findMany({
    where: {
      userId: req.user.userId,
    },
    include: {
      _count: {
        select: { applications: true },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return res.status(200).json(companies);
});

router.get("/:id", validateParams(idParamsSchema), async (req, res) => {
  const company = await prisma.company.findFirst({
    where: {
      id: req.validatedParams.id,
      userId: req.user.userId,
    },
  });

  if (!company) {
    throw notFound("Company not found");
  }

  return res.status(200).json(company);
});

router.patch(
  "/:id",
  validateParams(idParamsSchema),
  validateBody(updateCompanySchema),
  async (req, res) => {
    const companyId = req.validatedParams.id;
    const company = await prisma.company.findFirst({
      where: {
        id: companyId,
        userId: req.user.userId,
      },
      select: { id: true },
    });

    if (!company) {
      throw notFound("Company not found");
    }

    const updatedCompany = await prisma.company.update({
      where: { id: companyId },
      data: req.validatedBody,
    });

    return res.status(200).json(updatedCompany);
  },
);

router.delete("/:id", validateParams(idParamsSchema), async (req, res) => {
  const companyId = req.validatedParams.id;
  const company = await prisma.company.findFirst({
    where: {
      id: companyId,
      userId: req.user.userId,
    },
    select: {
      id: true,
      _count: {
        select: { applications: true },
      },
    },
  });

  if (!company) {
    throw notFound("Company not found");
  }

  if (company._count.applications > 0) {
    throw conflict(
      "This company still has applications. Archive or permanently delete them first.",
    );
  }

  await prisma.company.delete({
    where: { id: companyId },
  });

  return res.status(200).json({
    message: "Company deleted successfully",
  });
});

export default router;
