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
  createNoteSchema,
  idParamsSchema,
  noteQuerySchema,
  updateNoteSchema,
} from "../validation/schemas.js";

const router = Router();

router.use(authMiddleware);

router.post("/", validateBody(createNoteSchema), async (req, res) => {
  const { applicationId, content } = req.validatedBody;
  const application = await prisma.application.findFirst({
    where: {
      id: applicationId,
      userId: req.user.userId,
    },
    select: { id: true },
  });

  if (!application) {
    throw notFound("Application not found");
  }

  const note = await prisma.note.create({
    data: {
      content,
      userId: req.user.userId,
      applicationId,
    },
  });

  return res.status(201).json(note);
});

router.get("/", validateQuery(noteQuerySchema), async (req, res) => {
  const notes = await prisma.note.findMany({
    where: {
      userId: req.user.userId,
      ...req.validatedQuery,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return res.status(200).json(notes);
});

router.get("/:id", validateParams(idParamsSchema), async (req, res) => {
  const note = await prisma.note.findFirst({
    where: {
      id: req.validatedParams.id,
      userId: req.user.userId,
    },
  });

  if (!note) {
    throw notFound("Note not found");
  }

  return res.status(200).json(note);
});

router.patch(
  "/:id",
  validateParams(idParamsSchema),
  validateBody(updateNoteSchema),
  async (req, res) => {
    const noteId = req.validatedParams.id;
    const note = await prisma.note.findFirst({
      where: {
        id: noteId,
        userId: req.user.userId,
      },
      select: { id: true },
    });

    if (!note) {
      throw notFound("Note not found");
    }

    const updatedNote = await prisma.note.update({
      where: { id: noteId },
      data: req.validatedBody,
    });

    return res.status(200).json(updatedNote);
  },
);

router.delete("/:id", validateParams(idParamsSchema), async (req, res) => {
  const noteId = req.validatedParams.id;
  const note = await prisma.note.findFirst({
    where: {
      id: noteId,
      userId: req.user.userId,
    },
    select: { id: true },
  });

  if (!note) {
    throw notFound("Note not found");
  }

  await prisma.note.delete({
    where: { id: noteId },
  });

  return res.status(200).json({
    message: "Note deleted successfully",
  });
});

export default router;
