import { Router } from "express";
import prisma from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.middleware.js";

const router = Router();

const allowedStatuses = [
  "wishlist",
  "applied",
  "interview",
  "test_task",
  "offer",
  "rejected",
  "ghosted",
];

router.post("/", authMiddleware, async (req, res) => {
  try {
    const { title, companyId, status, jobUrl, salary, appliedAt } = req.body;

    if (typeof title !== "string") {
      return res.status(400).json({
        error: "Title is required",
      });
    }

    const normalizedTitle = title.trim();

    if (!normalizedTitle) {
      return res.status(400).json({
        error: "Title is required",
      });
    }

    if (typeof companyId !== "number") {
      return res.status(400).json({
        error: "Company id is required",
      });
    }

    if (status !== undefined && typeof status !== "string") {
      return res.status(400).json({
        error: "Status must be a string",
      });
    }

    if (status !== undefined && !allowedStatuses.includes(status)) {
      return res.status(400).json({
        error: "Invalid application status",
      });
    }

    if (jobUrl !== undefined && typeof jobUrl !== "string") {
      return res.status(400).json({
        error: "Job URL must be a string",
      });
    }

    if (salary !== undefined && typeof salary !== "string") {
      return res.status(400).json({
        error: "Salary must be a string",
      });
    }

    if (appliedAt !== undefined && typeof appliedAt !== "string") {
      return res.status(400).json({
        error: "Applied date must be a string",
      });
    }

    let normalizedAppliedAt = null;

    if (appliedAt !== undefined) {
      const parsedDate = new Date(appliedAt);

      if (Number.isNaN(parsedDate.getTime())) {
        return res.status(400).json({
          error: "Invalid appliedAt date",
        });
      }

      normalizedAppliedAt = parsedDate;
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

    const normalizedJobUrl =
      jobUrl === undefined ? undefined : jobUrl.trim() || null;

    const normalizedSalary =
      salary === undefined ? undefined : salary.trim() || null;

    const application = await prisma.application.create({
      data: {
        title: normalizedTitle,
        status,
        jobUrl: normalizedJobUrl,
        salary: normalizedSalary,
        appliedAt: normalizedAppliedAt,
        userId: req.user.userId,
        companyId,
      },
    });

    return res.status(201).json(application);
  } catch (error) {
    console.error("CREATE APPLICATION ERROR:", error);

    return res.status(500).json({
      error: "Failed to create application",
    });
  }
});

router.get("/", authMiddleware, async (req, res) => {
  try {
    const { status, companyId } = req.query;

    const where = {
      userId: req.user.userId,
    };

    if (status !== undefined) {
      if (typeof status !== "string" || !allowedStatuses.includes(status)) {
        return res.status(400).json({
          error: "Invalid application status",
        });
      }

      where.status = status;
    }

    if (companyId !== undefined) {
      const parsedCompanyId = Number(companyId);

      if (Number.isNaN(parsedCompanyId)) {
        return res.status(400).json({
          error: "Invalid company id",
        });
      }

      where.companyId = parsedCompanyId;
    }

    const applications = await prisma.application.findMany({
      where,
      orderBy: {
        createdAt: "desc",
      },
    });

    return res.status(200).json(applications);
  } catch (error) {
    console.error("GET APPLICATIONS ERROR:", error);

    return res.status(500).json({
      error: "Failed to fetch applications",
    });
  }
});

router.get("/dashboard", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;

    const [statusCounts, companies, recentApplications] = await Promise.all([
      prisma.application.groupBy({
        by: ["status"],
        where: {
          userId,
        },
        _count: {
          id: true,
        },
      }),
      prisma.company.findMany({
        where: {
          userId,
        },
        select: {
          id: true,
          name: true,
          _count: {
            select: {
              applications: true,
            },
          },
        },
      }),
      prisma.application.findMany({
        where: {
          userId,
        },
        orderBy: {
          createdAt: "desc",
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
    ]);

    const countsByStatus = Object.fromEntries(
      allowedStatuses.map((status) => [status, 0])
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
        (a, b) =>
          b.count - a.count || a.companyName.localeCompare(b.companyName)
      );

    return res.status(200).json({
      totalApplications: statusCounts.reduce(
        (total, item) => total + item._count.id,
        0
      ),
      countsByStatus,
      applicationsPerCompany,
      recentApplications,
    });
  } catch (error) {
    console.error("GET APPLICATION DASHBOARD ERROR:", error);

    return res.status(500).json({
      error: "Failed to fetch application dashboard",
    });
  }
});

router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const applicationId = Number(req.params.id);

    if (Number.isNaN(applicationId)) {
      return res.status(400).json({
        error: "Invalid application id",
      });
    }

    const application = await prisma.application.findFirst({
      where: {
        id: applicationId,
        userId: req.user.userId,
      },
    });

    if (!application) {
      return res.status(404).json({
        error: "Application not found",
      });
    }

    return res.status(200).json(application);
  } catch (error) {
    console.error("GET APPLICATION BY ID ERROR:", error);

    return res.status(500).json({
      error: "Failed to fetch application",
    });
  }
});

router.patch("/:id", authMiddleware, async (req, res) => {
  try {
    const applicationId = Number(req.params.id);

    if (Number.isNaN(applicationId)) {
      return res.status(400).json({
        error: "Invalid application id",
      });
    }

    const { title, status, jobUrl, salary, appliedAt } = req.body;

    const data = {};

    if (title !== undefined) {
      if (typeof title !== "string") {
        return res.status(400).json({
          error: "Title must be a string",
        });
      }

      const normalizedTitle = title.trim();

      if (!normalizedTitle) {
        return res.status(400).json({
          error: "Title cannot be empty",
        });
      }

      data.title = normalizedTitle;
    }

    if (status !== undefined) {
      if (typeof status !== "string") {
        return res.status(400).json({
          error: "Status must be a string",
        });
      }

      if (!allowedStatuses.includes(status)) {
        return res.status(400).json({
          error: "Invalid application status",
        });
      }

      data.status = status;
    }

    if (jobUrl !== undefined) {
      if (typeof jobUrl !== "string") {
        return res.status(400).json({
          error: "Job URL must be a string",
        });
      }

      data.jobUrl = jobUrl.trim() || null;
    }

    if (salary !== undefined) {
      if (typeof salary !== "string") {
        return res.status(400).json({
          error: "Salary must be a string",
        });
      }

      data.salary = salary.trim() || null;
    }

    if (appliedAt !== undefined) {
      if (typeof appliedAt !== "string") {
        return res.status(400).json({
          error: "Applied date must be a string",
        });
      }

      if (!appliedAt.trim()) {
        data.appliedAt = null;
      } else {
        const parsedDate = new Date(appliedAt);

        if (Number.isNaN(parsedDate.getTime())) {
          return res.status(400).json({
            error: "Invalid appliedAt date",
          });
        }

        data.appliedAt = parsedDate;
      }
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({
        error: "No fields to update",
      });
    }

    const application = await prisma.application.findFirst({
      where: {
        id: applicationId,
        userId: req.user.userId,
      },
    });

    if (!application) {
      return res.status(404).json({
        error: "Application not found",
      });
    }

    const updatedApplication = await prisma.application.update({
      where: {
        id: applicationId,
      },
      data,
    });

    return res.status(200).json(updatedApplication);
  } catch (error) {
    console.error("UPDATE APPLICATION ERROR:", error);

    return res.status(500).json({
      error: "Failed to update application",
    });
  }
});

router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const applicationId = Number(req.params.id);

    if (Number.isNaN(applicationId)) {
      return res.status(400).json({
        error: "Invalid application id",
      });
    }

    const application = await prisma.application.findFirst({
      where: {
        id: applicationId,
        userId: req.user.userId,
      },
    });

    if (!application) {
      return res.status(404).json({
        error: "Application not found",
      });
    }

    await prisma.application.delete({
      where: {
        id: applicationId,
      },
    });

    return res.status(200).json({
      message: "Application deleted successfully",
    });
  } catch (error) {
    console.error("DELETE APPLICATION ERROR:", error);

    return res.status(500).json({
      error: "Failed to delete application",
    });
  }
});

export default router;
