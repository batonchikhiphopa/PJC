import { Router } from "express";
import prisma from "../lib/prisma.js";
import { authMiddleware } from "../middleware/auth.middleware.js";

const router = Router();

router.post("/", authMiddleware, async (req, res) => {
  try {
    const { content, applicationId } = req.body;

    if (typeof content !== "string") {
      return res.status(400).json({
        error: "Content is required",
      });
    }

    const normalizedContent = content.trim();

    if (!normalizedContent) {
      return res.status(400).json({
        error: "Content is required",
      });
    }

    if (typeof applicationId !== "number") {
      return res.status(400).json({
        error: "Application id is required",
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

    const note = await prisma.note.create({
      data: {
        content: normalizedContent,
        userId: req.user.userId,
        applicationId,
      },
    });

    return res.status(201).json(note);
  } catch (error) {
    console.error("CREATE NOTE ERROR:", error);

    return res.status(500).json({
      error: "Failed to create note",
    });
  }
});

router.get("/", authMiddleware, async (req, res) => {
  try {
    const { applicationId } = req.query;

    const where = {
      userId: req.user.userId,
    };

    if (applicationId !== undefined) {
      const parsedApplicationId = Number(applicationId);

      if (Number.isNaN(parsedApplicationId)) {
        return res.status(400).json({
          error: "Invalid application id",
        });
      }

      where.applicationId = parsedApplicationId;
    }

    const notes = await prisma.note.findMany({
      where,
      orderBy: {
        createdAt: "desc",
      },
    });

    return res.status(200).json(notes);
  } catch (error) {
    console.error("GET NOTES ERROR:", error);

    return res.status(500).json({
      error: "Failed to fetch notes",
    });
  }
});

router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const noteId = Number(req.params.id);

    if (Number.isNaN(noteId)) {
      return res.status(400).json({
        error: "Invalid note id",
      });
    }

    const note = await prisma.note.findFirst({
      where: {
        id: noteId,
        userId: req.user.userId,
      },
    });

    if (!note) {
      return res.status(404).json({
        error: "Note not found",
      });
    }

    return res.status(200).json(note);
  } catch (error) {
    console.error("GET NOTE BY ID ERROR:", error);

    return res.status(500).json({
      error: "Failed to fetch note",
    });
  }
});

router.patch("/:id", authMiddleware, async (req, res) => {
  try {
    const noteId = Number(req.params.id);

    if (Number.isNaN(noteId)) {
      return res.status(400).json({
        error: "Invalid note id",
      });
    }

    const { content } = req.body;

    if (typeof content !== "string") {
      return res.status(400).json({
        error: "Content is required",
      });
    }

    const normalizedContent = content.trim();

    if (!normalizedContent) {
      return res.status(400).json({
        error: "Content is required",
      });
    }

    const note = await prisma.note.findFirst({
      where: {
        id: noteId,
        userId: req.user.userId,
      },
    });

    if (!note) {
      return res.status(404).json({
        error: "Note not found",
      });
    }

    const updatedNote = await prisma.note.update({
      where: {
        id: noteId,
      },
      data: {
        content: normalizedContent,
      },
    });

    return res.status(200).json(updatedNote);
  } catch (error) {
    console.error("UPDATE NOTE ERROR:", error);

    return res.status(500).json({
      error: "Failed to update note",
    });
  }
});

router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const noteId = Number(req.params.id);

    if (Number.isNaN(noteId)) {
      return res.status(400).json({
        error: "Invalid note id",
      });
    }

    const note = await prisma.note.findFirst({
      where: {
        id: noteId,
        userId: req.user.userId,
      },
    });

    if (!note) {
      return res.status(404).json({
        error: "Note not found",
      });
    }

    await prisma.note.delete({
      where: {
        id: noteId,
      },
    });

    return res.status(200).json({
      message: "Note deleted successfully",
    });
  } catch (error) {
    console.error("DELETE NOTE ERROR:", error);

    return res.status(500).json({
      error: "Failed to delete note",
    });
  }
});

export default router;