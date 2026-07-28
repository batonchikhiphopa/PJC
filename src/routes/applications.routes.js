import { Router } from "express";

import prisma from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import {
  validateBody,
  validateParams,
  validateQuery,
} from "../middleware/validate.middleware.js";
import { notFound } from "../errors/app-error.js";
import {
  applicationQuerySchema,
  applicationStatuses,
  createApplicationSchema,
  idParamsSchema,
  updateApplicationSchema,
} from "../validation/schemas.js";

const router = Router();

router.use(authMiddleware);

function archiveFilter(value) {
  if (value === "archived") {
    return { archivedAt: { not: null } };
  }

  if (value === "all") {
    return {};
  }

  return { archivedAt: null };
}

function applicationOrder(sort) {
  const choices = {
    updated_desc: [{ updatedAt: "desc" }],
    updated_asc: [{ updatedAt: "asc" }],
    deadline_asc: [
      { nextActionAt: { sort: "asc", nulls: "last" } },
      { updatedAt: "desc" },
    ],
    created_desc: [{ createdAt: "desc" }],
    company_asc: [
      { company: { name: "asc" } },
      { updatedAt: "desc" },
    ],
  };

  return choices[sort] ?? choices.updated_desc;
}

function applicationSearch(search) {
  if (!search) return {};

  return {
    OR: [
      { title: { contains: search, mode: "insensitive" } },
      { source: { contains: search, mode: "insensitive" } },
      { contactName: { contains: search, mode: "insensitive" } },
      { nextAction: { contains: search, mode: "insensitive" } },
      {
        company: {
          name: { contains: search, mode: "insensitive" },
        },
      },
    ],
  };
}

async function findOwnedApplication(id, userId, select = { id: true }) {
  const application = await prisma.application.findFirst({
    where: { id, userId },
    select,
  });

  if (!application) {
    throw notFound("Application not found");
  }

  return application;
}

router.post("/", validateBody(createApplicationSchema), async (req, res) => {
  const userId = req.user.userId;
  const {
    companyId: requestedCompanyId,
    company: newCompany,
    ...applicationData
  } = req.validatedBody;

  const application = await prisma.$transaction(async (transaction) => {
    let companyId = requestedCompanyId;

    if (newCompany) {
      const company = await transaction.company.create({
        data: {
          ...newCompany,
          userId,
        },
        select: { id: true },
      });
      companyId = company.id;
    } else {
      const company = await transaction.company.findFirst({
        where: {
          id: requestedCompanyId,
          userId,
        },
        select: { id: true },
      });

      if (!company) {
        throw notFound("Company not found");
      }
    }

    const createdApplication = await transaction.application.create({
      data: {
        ...applicationData,
        companyId,
        userId,
      },
      include: {
        company: {
          select: { id: true, name: true },
        },
      },
    });

    await transaction.applicationStatusHistory.create({
      data: {
        toStatus: createdApplication.status,
        userId,
        applicationId: createdApplication.id,
      },
    });

    return createdApplication;
  });

  return res.status(201).json(application);
});

router.get(
  "/",
  validateQuery(applicationQuerySchema),
  async (req, res) => {
    const { archived, search, sort, ...filters } = req.validatedQuery;
    const applications = await prisma.application.findMany({
      where: {
        userId: req.user.userId,
        ...filters,
        ...archiveFilter(archived),
        ...applicationSearch(search),
      },
      include: {
        company: {
          select: { id: true, name: true },
        },
      },
      orderBy: applicationOrder(sort),
    });

    return res.status(200).json(applications);
  },
);

router.get("/dashboard", async (req, res) => {
  const userId = req.user.userId;
  const activeApplications = { userId, archivedAt: null };
  const actionsFilter = {
    ...activeApplications,
    nextAction: { not: null },
  };
  const now = new Date();

  const [
    statusCounts,
    companies,
    recentApplications,
    nextActions,
    nextActionCount,
    overdueActionCount,
    unscheduledActionCount,
  ] =
    await Promise.all([
      prisma.application.groupBy({
        by: ["status"],
        where: activeApplications,
        _count: { id: true },
      }),
      prisma.company.findMany({
        where: { userId },
        select: {
          id: true,
          name: true,
          _count: {
            select: {
              applications: {
                where: { archivedAt: null },
              },
            },
          },
        },
      }),
      prisma.application.findMany({
        where: activeApplications,
        orderBy: {
          updatedAt: "desc",
        },
        take: 5,
        select: {
          id: true,
          title: true,
          status: true,
          appliedAt: true,
          createdAt: true,
          company: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      prisma.application.findMany({
        where: actionsFilter,
        orderBy: [
          { nextActionAt: "asc" },
          { updatedAt: "desc" },
        ],
        take: 12,
        select: {
          id: true,
          title: true,
          status: true,
          nextAction: true,
          nextActionAt: true,
          company: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      prisma.application.count({
        where: actionsFilter,
      }),
      prisma.application.count({
        where: {
          ...actionsFilter,
          nextActionAt: { lt: now },
        },
      }),
      prisma.application.count({
        where: {
          ...actionsFilter,
          nextActionAt: null,
        },
      }),
    ]);

  const countsByStatus = Object.fromEntries(
    applicationStatuses.map((status) => [status, 0]),
  );

  for (const item of statusCounts) {
    countsByStatus[item.status] = item._count.id;
  }

  const applicationsPerCompany = companies
    .map((company) => ({
      companyId: company.id,
      companyName: company.name,
      count: company._count.applications,
    }))
    .filter((company) => company.count > 0)
    .sort(
      (first, second) =>
        second.count - first.count ||
        first.companyName.localeCompare(second.companyName),
    );

  return res.status(200).json({
    totalApplications: statusCounts.reduce(
      (total, item) => total + item._count.id,
      0,
    ),
    countsByStatus,
    applicationsPerCompany,
    recentApplications,
    nextActions,
    nextActionCount,
    overdueActionCount,
    unscheduledActionCount,
  });
});

router.post(
  "/:id/archive",
  validateParams(idParamsSchema),
  async (req, res) => {
    const applicationId = req.validatedParams.id;
    await findOwnedApplication(applicationId, req.user.userId);

    const application = await prisma.application.update({
      where: { id: applicationId },
      data: { archivedAt: new Date() },
    });

    return res.status(200).json(application);
  },
);

router.post(
  "/:id/restore",
  validateParams(idParamsSchema),
  async (req, res) => {
    const applicationId = req.validatedParams.id;
    await findOwnedApplication(applicationId, req.user.userId);

    const application = await prisma.application.update({
      where: { id: applicationId },
      data: { archivedAt: null },
    });

    return res.status(200).json(application);
  },
);

router.get("/:id", validateParams(idParamsSchema), async (req, res) => {
  const application = await prisma.application.findFirst({
    where: {
      id: req.validatedParams.id,
      userId: req.user.userId,
    },
    include: {
      company: {
        select: { id: true, name: true },
      },
      statusHistory: {
        orderBy: { changedAt: "desc" },
        select: {
          id: true,
          fromStatus: true,
          toStatus: true,
          changedAt: true,
        },
      },
    },
  });

  if (!application) {
    throw notFound("Application not found");
  }

  return res.status(200).json(application);
});

router.patch(
  "/:id",
  validateParams(idParamsSchema),
  validateBody(updateApplicationSchema),
  async (req, res) => {
    const applicationId = req.validatedParams.id;
    const userId = req.user.userId;
    const currentApplication = await findOwnedApplication(
      applicationId,
      userId,
      { id: true, status: true },
    );
    const statusChanged =
      req.validatedBody.status &&
      req.validatedBody.status !== currentApplication.status;

    const updatedApplication = await prisma.$transaction(
      async (transaction) => {
        const application = await transaction.application.update({
          where: { id: applicationId },
          data: req.validatedBody,
          include: {
            company: {
              select: { id: true, name: true },
            },
          },
        });

        if (statusChanged) {
          await transaction.applicationStatusHistory.create({
            data: {
              fromStatus: currentApplication.status,
              toStatus: req.validatedBody.status,
              userId,
              applicationId,
            },
          });
        }

        return application;
      },
    );

    return res.status(200).json(updatedApplication);
  },
);

router.delete("/:id", validateParams(idParamsSchema), async (req, res) => {
  const applicationId = req.validatedParams.id;
  await findOwnedApplication(applicationId, req.user.userId);

  await prisma.application.delete({
    where: { id: applicationId },
  });

  return res.status(200).json({
    message: "Application deleted successfully",
  });
});

export default router;
